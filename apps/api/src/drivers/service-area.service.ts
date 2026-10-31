import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { getEnv } from "@routeride/config";
import {
  DriverServiceAreaSettingsSchema,
  type DriverServiceAreaSettings,
} from "@routeride/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class ServiceAreaService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const rows = await this.prisma.query<{
      id: string;
      operating_city: string | null;
      starting_location: unknown;
      route_polyline: unknown;
      route_state: string;
      accepting_requests: boolean;
      availability_version: number;
      roster_version: number;
      coverage_setup_required: boolean;
      availability: unknown;
    }>(
      `SELECT id, operating_city,
        ST_AsGeoJSON(starting_location::geometry)::json AS starting_location,
        ST_AsGeoJSON(route_polyline::geometry)::json AS route_polyline,
        route_state, accepting_requests, availability_version, roster_version,
        coverage_setup_required,
        COALESCE((SELECT json_agg(json_build_object('day', operating_day,
          'startTime', to_char(window_start, 'HH24:MI'), 'endTime', to_char(window_end, 'HH24:MI'))
          ORDER BY operating_day, window_start) FROM driver_availability a
          WHERE a.driver_profile_id = driver_profiles.id), '[]'::json) AS availability
        FROM driver_profiles WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException("Driver profile not found");
    const parsed = DriverServiceAreaSettingsSchema.safeParse({
      city: row.operating_city,
      startingLocation: row.starting_location,
      routeState: row.route_state,
      routePolyline: row.route_polyline,
      acceptingRequests: row.accepting_requests,
      availability: row.availability,
    });
    return {
      settings: parsed.success ? parsed.data : null,
      availabilityVersion: row.availability_version,
      rosterVersion: row.roster_version,
      requiresSetup: row.coverage_setup_required || !parsed.success,
    };
  }

  async save(userId: string, raw: DriverServiceAreaSettings): Promise<void> {
    const settings = DriverServiceAreaSettingsSchema.parse(raw);
    const env = getEnv();
    const inBounds = ([lon, lat]: number[]) =>
      lon !== undefined &&
      lat !== undefined &&
      lon >= env.LAUNCH_CITY_BBOX_MIN_LON &&
      lon <= env.LAUNCH_CITY_BBOX_MAX_LON &&
      lat >= env.LAUNCH_CITY_BBOX_MIN_LAT &&
      lat <= env.LAUNCH_CITY_BBOX_MAX_LAT;
    if (
      !inBounds(settings.startingLocation.coordinates) ||
      (settings.routePolyline &&
        !settings.routePolyline.coordinates.every(inBounds))
    ) {
      throw new UnprocessableEntityException(
        "Start location and route must be inside the operating city bounds",
      );
    }
    const client = await this.prisma.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const rows = await client.query<{
        id: string;
        coverage_setup_required: boolean;
      }>(
        "SELECT id, coverage_setup_required FROM driver_profiles WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      const profile = rows.rows[0];
      if (!profile) throw new NotFoundException("Driver profile not found");
      const commitments = await client.query(
        "SELECT id FROM subscriptions WHERE driver_profile_id = $1 AND status IN ('ACTIVE', 'PAUSED') LIMIT 1",
        [profile.id],
      );
      const start = JSON.stringify(settings.startingLocation);
      const route = settings.routePolyline
        ? JSON.stringify(settings.routePolyline)
        : null;
      const validity = await client.query<{ valid: boolean }>(
        `SELECT ($1::text IS NULL OR (ST_IsValid(ST_GeomFromGeoJSON($1))
            AND ST_IsSimple(ST_GeomFromGeoJSON($1)))) AS valid`,
        [route],
      );
      if (!validity.rows[0]?.valid)
        throw new UnprocessableEntityException(
          "The supplied route must be valid and simple",
        );
      if (commitments.rows.length) {
        // Preserve existing route and schedule commitments when completing setup.
        // Other edits require a feasibility-reviewed path.
        const preservation = await client.query<{ safe: boolean }>(
          `SELECT route_state = $2 AND
            ((route_polyline IS NULL AND $3::text IS NULL) OR
              (route_polyline IS NOT NULL AND $3::text IS NOT NULL AND
                ST_OrderingEquals(route_polyline::geometry, ST_SetSRID(ST_GeomFromGeoJSON($3),4326))))
            AND NOT EXISTS (
              SELECT 1 FROM subscriptions s WHERE s.driver_profile_id = dp.id
                AND s.status IN ('ACTIVE','PAUSED') AND
                (s.agreed_pickup_location IS NULL OR s.agreed_dropoff_location IS NULL
                 OR NOT EXISTS (SELECT 1 FROM driver_schedule_slots dss WHERE dss.subscription_id = s.id))
            ) AND NOT EXISTS (
              SELECT 1 FROM driver_schedule_slots dss JOIN subscriptions s ON s.id = dss.subscription_id
              CROSS JOIN LATERAL unnest(dss.operating_days) AS day_values(operating_day)
              WHERE dss.driver_profile_id = dp.id AND s.status IN ('ACTIVE','PAUSED')
                AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($5::jsonb)
                  AS a(day integer, "startTime" text, "endTime" text)
                  WHERE a.day = day_values.operating_day
                    AND a."startTime"::time <= dss.slot_start AND a."endTime"::time >= dss.slot_end)
            ) AND (coverage_setup_required OR
              (operating_city = $4 AND
               ST_Equals(starting_location::geometry, ST_GeomFromGeoJSON($6)) AND
               (SELECT COUNT(*) FROM driver_availability a WHERE a.driver_profile_id = dp.id) = $7 AND
               NOT EXISTS (SELECT 1 FROM driver_availability a WHERE a.driver_profile_id = dp.id
                 AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($5::jsonb)
                   AS v(day integer, "startTime" text, "endTime" text)
                   WHERE v.day=a.operating_day
                     AND v."startTime"::time=a.window_start AND v."endTime"::time=a.window_end))))
            AS safe FROM driver_profiles dp WHERE id=$1`,
          [
            profile.id,
            settings.routeState,
            route,
            settings.city,
            JSON.stringify(settings.availability),
            start,
            settings.availability.length,
          ],
        );
        if (!preservation.rows[0]?.safe)
          throw new ConflictException(
            "Settings must preserve every accepted rider's route and windows; other edits require a reviewed schedule change",
          );
      }
      await client.query(
        `UPDATE driver_profiles SET
        operating_city = $2,
        starting_location = ST_SetSRID(ST_GeomFromGeoJSON($3),4326),
        route_state = $4,
        route_polyline = CASE WHEN $5::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($5),4326) END,
        accepting_requests = $6, coverage_setup_required = false,
        operating_days = $7::smallint[],
        availability_version = availability_version + 1, updated_at = NOW()
        WHERE id = $1`,
        [
          profile.id,
          settings.city,
          start,
          settings.routeState,
          route,
          settings.acceptingRequests,
          [...new Set(settings.availability.map((a) => a.day))],
        ],
      );
      await client.query(
        "DELETE FROM driver_availability WHERE driver_profile_id = $1",
        [profile.id],
      );
      for (const window of settings.availability) {
        await client.query(
          `INSERT INTO driver_availability
          (driver_profile_id,operating_day,window_start,window_end)
          VALUES ($1,$2,$3::time,$4::time)`,
          [profile.id, window.day, window.startTime, window.endTime],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if ((error as { code?: string }).code === "40001") {
        throw new ConflictException(
          "Driver availability changed concurrently; reload and retry",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

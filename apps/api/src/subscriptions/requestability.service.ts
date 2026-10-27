import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { getEnv } from "@routeride/config";
import type { RequestedLegV2 } from "@routeride/contracts";
import type pg from "pg";

export interface RequestableTerms {
  operatingDays: number[];
  legs: RequestedLegV2[];
}

@Injectable()
export class RequestabilityService {
  async inspect(
    client: Pick<pg.PoolClient, "query">,
    driverId: string,
    terms: RequestableTerms,
  ) {
    const env = getEnv();
    for (const leg of terms.legs) {
      for (const [lon, lat] of [
        leg.pickupLocation.coordinates,
        leg.dropoffLocation.coordinates,
      ]) {
        if (
          lon < env.LAUNCH_CITY_BBOX_MIN_LON ||
          lon > env.LAUNCH_CITY_BBOX_MAX_LON ||
          lat < env.LAUNCH_CITY_BBOX_MIN_LAT ||
          lat > env.LAUNCH_CITY_BBOX_MAX_LAT
        ) {
          throw new UnprocessableEntityException(
            "Requested endpoints are outside platform coverage",
          );
        }
      }
    }
    const result = await client.query<{
      monthly_price_cents: number;
      currency: string;
      available_seats: number;
    }>(
      `
      WITH legs AS (
        SELECT * FROM jsonb_to_recordset($2::jsonb) AS l("legType" text,
          "pickupLocation" jsonb,"dropoffLocation" jsonb,"pickupWindowStart" text,
          "pickupWindowEnd" text,"arrivalDeadline" text)
      ), requested AS (
        SELECT l.*, day FROM legs l CROSS JOIN unnest($3::smallint[]) AS d(day)
      ), eligible AS (
      SELECT dp.*
      FROM driver_profiles dp WHERE dp.id=$1 AND dp.status='APPROVED'
        AND dp.accepting_requests AND NOT dp.coverage_setup_required
        AND dp.starting_location IS NOT NULL
        AND ((dp.route_state='UNSET' AND dp.route_polyline IS NULL) OR
          (dp.route_state='ESTABLISHED' AND dp.route_polyline IS NOT NULL
           AND NOT ST_IsEmpty(dp.route_polyline::geometry)
           AND ST_GeometryType(dp.route_polyline::geometry)='ST_LineString'
           AND ST_SRID(dp.route_polyline)=4326 AND ST_IsValid(dp.route_polyline::geometry)
           AND ST_IsSimple(dp.route_polyline::geometry)))
        AND NOT EXISTS (SELECT 1 FROM requested r WHERE
          (NOT ST_Covers(dp.service_area::geometry,ST_GeomFromGeoJSON(r."pickupLocation"::text))
            OR NOT ST_Covers(dp.service_area::geometry,ST_GeomFromGeoJSON(r."dropoffLocation"::text)))
          OR NOT EXISTS (SELECT 1 FROM driver_availability a WHERE a.driver_profile_id=dp.id
            AND a.operating_day=r.day
            AND a.window_start<=r."pickupWindowStart"::time AND a.window_end>=r."arrivalDeadline"::time))
      ), capacity AS (
        SELECT dp.id, MIN(CASE WHEN EXISTS (SELECT 1 FROM recurring_runs rr WHERE rr.driver_profile_id=dp.id
                AND rr.operating_day=r.day AND rr.leg_type::text=r."legType" AND rr.needs_review
                AND (rr.effective_to IS NULL OR rr.effective_to>=CURRENT_DATE))
            THEN dp.seat_capacity-(SELECT COUNT(DISTINCT ra.subscription_id) FROM recurring_runs rr
              JOIN run_assignments ra ON ra.run_id=rr.id JOIN subscriptions s ON s.id=ra.subscription_id
              WHERE rr.driver_profile_id=dp.id AND rr.operating_day=r.day AND rr.leg_type::text=r."legType"
                AND s.status='ACTIVE' AND (rr.effective_to IS NULL OR rr.effective_to>=CURRENT_DATE)
                AND (ra.effective_to IS NULL OR ra.effective_to>=CURRENT_DATE))
            ELSE COALESCE((SELECT MAX(LEAST(dp.seat_capacity,rr.seat_capacity)-
              (SELECT COUNT(DISTINCT ra.subscription_id) FROM run_assignments ra
               JOIN subscriptions s ON s.id=ra.subscription_id WHERE ra.run_id=rr.id AND s.status='ACTIVE'
               AND (ra.effective_to IS NULL OR ra.effective_to>=CURRENT_DATE)))
              FROM recurring_runs rr WHERE rr.driver_profile_id=dp.id AND rr.operating_day=r.day
                AND rr.leg_type::text=r."legType" AND (rr.effective_to IS NULL OR rr.effective_to>=CURRENT_DATE)
                AND rr.starts_at<=r."pickupWindowStart"::time AND rr.ends_at>=r."pickupWindowStart"::time),dp.seat_capacity)
            END)::int AS available_seats
        FROM eligible dp CROSS JOIN requested r GROUP BY dp.id,dp.seat_capacity
      )
      SELECT e.base_price_cents AS monthly_price_cents,e.currency,c.available_seats
        FROM eligible e JOIN capacity c ON c.id=e.id WHERE c.available_seats>0
    `,
      [driverId, JSON.stringify(terms.legs), terms.operatingDays],
    );
    const row = result.rows[0];
    if (!row)
      throw new UnprocessableEntityException(
        "Driver is not requestable for every requested day, leg and window",
      );
    return {
      monthlyPriceCents: row.monthly_price_cents,
      currency: row.currency,
      availableSeats: row.available_seats,
    };
  }
}

/**
 * DriversService — driver profile business logic.
 *
 * All DB writes use this.prisma.sql raw queries because driver_profiles
 * contains a geography(LineString,4326) column that Prisma's generated
 * client cannot handle through its ORM layer (ADR-002).
 *
 * Business rules (T0.37, T0.39, T0.40):
 *  - A driver may have at most ONE profile (duplicate userId → 409)
 *  - plateNumber is globally unique (duplicate → 409)
 *  - Profile status is always PENDING on creation
 *  - seatCapacity is bounded 1–50 (enforced by Zod at boundary + DB CHECK)
 *  - vehicleYear must be sane (1990 … currentYear+1, enforced at boundary)
 *  - operatingDays must be non-empty and unique (enforced at boundary)
 *  - basePriceCents is clamped to DRIVER_PRICE_MIN/MAX from env (T0.40)
 *  - A day cannot be dropped from operatingDays if active subscriptions exist
 *    for that day (T0.40)
 *  - Route (T0.39): validated at boundary (coordinate ranges, min 2 points,
 *    non-zero-length) + PostGIS ST_IsValid enforced on INSERT
 */
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { getEnv } from "@routeride/config";
import { mutateDriverProfile } from "./profile-mutation.js";
import type {
  OnboardDriverRequest,
  DriverProfile,
  UpdateDriverAvailability,
  SetDriverRouteFromLocations,
} from "@routeride/contracts";

// ─── Internal row shape returned by raw SELECT queries ─────────────────────

interface DriverProfileRow {
  id: string;
  user_id: string;
  licence_number: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  vehicle_colour: string;
  plate_number: string;
  seat_capacity: number;
  operating_days: number[];
  base_price_cents: number;
  currency: string;
  status: string;
  verification_tier: string;
  acceptance_rate: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  route_polyline?: DriverProfile["routePolyline"];
  coverage_configured?: boolean;
}

// ─── Helper to map raw row → DriverProfile contract type ───────────────────

function rowToProfile(row: DriverProfileRow): DriverProfile {
  return {
    id: row.id,
    userId: row.user_id,
    licenceNumber: row.licence_number,
    vehicleMake: row.vehicle_make,
    vehicleModel: row.vehicle_model,
    vehicleYear: row.vehicle_year,
    vehicleColour: row.vehicle_colour,
    plateNumber: row.plate_number,
    seatCapacity: row.seat_capacity,
    operatingDays: row.operating_days,
    basePriceCents: row.base_price_cents,
    currency: row.currency,
    status: row.status as DriverProfile["status"],
    verificationTier:
      row.verification_tier as DriverProfile["verificationTier"],
    acceptanceRate:
      row.acceptance_rate != null ? Number(row.acceptance_rate) : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(row.route_polyline ? { routePolyline: row.route_polyline } : {}),
  };
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── T0.37: Onboard ─────────────────────────────────────────────────────────

  async onboard(
    userId: string,
    dto: OnboardDriverRequest,
  ): Promise<DriverProfile> {
    const env = getEnv();

    // 1. Check for existing profile (one per driver)
    const existing = (await this.prisma.sql`
      SELECT id FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
    `) as unknown as { id: string }[];
    if (existing.length > 0) {
      throw new ConflictException(
        "A driver profile already exists for this account",
      );
    }

    // 2. Enforce platform price guardrails if basePriceCents is provided
    let basePriceCents = 0;
    if (dto.basePriceCents !== undefined) {
      if (dto.basePriceCents < env.DRIVER_PRICE_MIN_CENTS) {
        throw new UnprocessableEntityException(
          `basePriceCents must be at least ${env.DRIVER_PRICE_MIN_CENTS} (platform minimum)`,
        );
      }
      if (dto.basePriceCents > env.DRIVER_PRICE_MAX_CENTS) {
        throw new UnprocessableEntityException(
          `basePriceCents must be at most ${env.DRIVER_PRICE_MAX_CENTS} (platform maximum)`,
        );
      }
      basePriceCents = dto.basePriceCents;
    }

    // 3. Build operating_days as Postgres smallint array literal
    const days = dto.operatingDays ?? [];
    const daysLiteral = `{${days.join(",")}}`;

    // 4. INSERT — unique constraint on plate_number catches duplicates
    try {
      const rows = (await this.prisma.sql`
        INSERT INTO driver_profiles (
          user_id, licence_number, vehicle_make, vehicle_model, vehicle_year,
          vehicle_colour, plate_number, seat_capacity, operating_days,
          base_price_cents, currency, status
        )
        VALUES (
          ${userId},
          ${dto.licenceNumber},
          ${dto.vehicleMake},
          ${dto.vehicleModel},
          ${dto.vehicleYear}::smallint,
          ${dto.vehicleColour},
          ${dto.plateNumber},
          ${dto.seatCapacity}::smallint,
          ${daysLiteral}::smallint[],
          ${basePriceCents},
          ${dto.currency},
          'PENDING'
        )
        RETURNING
          id, user_id, licence_number, vehicle_make, vehicle_model, vehicle_year,
          vehicle_colour, plate_number, seat_capacity, operating_days,
          base_price_cents, currency, status, verification_tier,
          acceptance_rate, created_at, updated_at
      `) as unknown as DriverProfileRow[];

      const profile = rows[0];
      if (!profile) throw new Error("INSERT returned no rows");

      this.logger.log({
        event: "driver.onboarded",
        userId,
        driverProfileId: profile.id,
      });

      return rowToProfile(profile);
    } catch (err: unknown) {
      // Postgres unique-violation code: 23505
      if ((err as { code?: string }).code === "23505") {
        throw new ConflictException(
          "A driver with this plate number is already registered",
        );
      }
      throw err;
    }
  }

  // ── T0.37: Get my profile ──────────────────────────────────────────────────

  async getMyProfile(userId: string): Promise<DriverProfile> {
    const rows = (await this.prisma.sql`
      SELECT
        id, user_id, licence_number, vehicle_make, vehicle_model, vehicle_year,
        vehicle_colour, plate_number, seat_capacity, operating_days,
        base_price_cents, currency, status, verification_tier,
        acceptance_rate, created_at, updated_at,
        ST_AsGeoJSON(route_polyline::geometry)::json AS route_polyline
      FROM driver_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `) as unknown as DriverProfileRow[];

    if (rows.length === 0) {
      throw new NotFoundException("Driver profile not found");
    }

    return rowToProfile(rows[0]!);
  }

  // ── Derived Onboarding Status Evaluator ────────────────────────────────────

  async getOnboardingStatus(userId: string): Promise<{
    currentStep:
      | "step1-vehicle"
      | "step2-documents"
      | "step4-availability"
      | "pending"
      | "approved"
      | "rejected"
      | "suspended";
    status: DriverProfile["status"] | null;
    profileCompleted: boolean;
    documentsCompleted: boolean;
    availabilityCompleted: boolean;
    uploadedDocuments: ("CNIC" | "LICENCE" | "REGISTRATION" | "INSURANCE")[];
    missingDocuments: ("CNIC" | "LICENCE" | "REGISTRATION" | "INSURANCE")[];
  }> {
    const REQUIRED_DOCS = [
      "CNIC",
      "LICENCE",
      "REGISTRATION",
      "INSURANCE",
    ] as const;
    const env = getEnv();

    // 1. Check profile existence
    const rows = (await this.prisma.sql`
      SELECT
        id, user_id, licence_number, vehicle_make, vehicle_model, vehicle_year,
        vehicle_colour, plate_number, seat_capacity, operating_days,
        base_price_cents, currency, status, verification_tier,
        acceptance_rate, created_at, updated_at,
        (NOT coverage_setup_required AND service_area IS NOT NULL AND starting_location IS NOT NULL
         AND EXISTS (SELECT 1 FROM driver_availability a WHERE a.driver_profile_id = driver_profiles.id))
        AS coverage_configured
      FROM driver_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `) as unknown as DriverProfileRow[];

    if (rows.length === 0) {
      return {
        currentStep: "step1-vehicle",
        status: null,
        profileCompleted: false,
        documentsCompleted: false,
        availabilityCompleted: false,
        uploadedDocuments: [],
        missingDocuments: [...REQUIRED_DOCS],
      };
    }

    const profile = rows[0]!;

    // 2. Validate Step 1 profile completeness (explicit required fields)
    const profileCompleted = Boolean(
      profile.licence_number &&
      profile.licence_number.trim().length >= 3 &&
      profile.vehicle_make &&
      profile.vehicle_make.trim().length >= 1 &&
      profile.vehicle_model &&
      profile.vehicle_model.trim().length >= 1 &&
      profile.vehicle_year >= 1990 &&
      profile.vehicle_colour &&
      profile.vehicle_colour.trim().length >= 1 &&
      profile.plate_number &&
      profile.plate_number.trim().length >= 2 &&
      profile.seat_capacity >= 1,
    );

    if (!profileCompleted) {
      return {
        currentStep: "step1-vehicle",
        status: profile.status as DriverProfile["status"],
        profileCompleted: false,
        documentsCompleted: false,
        availabilityCompleted: false,
        uploadedDocuments: [],
        missingDocuments: [...REQUIRED_DOCS],
      };
    }

    // 3. Check confirmed documents
    const docRows = (await this.prisma.sql`
      SELECT doc_type
      FROM driver_documents
      WHERE driver_id = ${profile.id}
    `) as unknown as { doc_type: (typeof REQUIRED_DOCS)[number] }[];

    const uploadedDocuments = Array.from(
      new Set(docRows.map((r) => r.doc_type)),
    );
    const missingDocuments = REQUIRED_DOCS.filter(
      (d) => !uploadedDocuments.includes(d),
    );
    const documentsCompleted = missingDocuments.length === 0;

    if (!documentsCompleted) {
      return {
        currentStep: "step2-documents",
        status: profile.status as DriverProfile["status"],
        profileCompleted: true,
        documentsCompleted: false,
        availabilityCompleted: false,
        uploadedDocuments,
        missingDocuments,
      };
    }

    // 4. Check availability & pricing completeness
    const availabilityCompleted = Boolean(
      profile.coverage_configured &&
      Array.isArray(profile.operating_days) &&
      profile.operating_days.length > 0 &&
      typeof profile.base_price_cents === "number" &&
      profile.base_price_cents >= env.DRIVER_PRICE_MIN_CENTS &&
      profile.base_price_cents <= env.DRIVER_PRICE_MAX_CENTS,
    );

    if (!availabilityCompleted) {
      return {
        currentStep: "step4-availability",
        status: profile.status as DriverProfile["status"],
        profileCompleted: true,
        documentsCompleted: true,
        availabilityCompleted: false,
        uploadedDocuments,
        missingDocuments: [],
      };
    }

    // 5. Evaluate driver account status
    let currentStep: "pending" | "approved" | "rejected" | "suspended" =
      "pending";

    if (profile.status === "APPROVED") {
      currentStep = "approved";
    } else if (profile.status === "REJECTED") {
      currentStep = "rejected";
    } else if (profile.status === "SUSPENDED") {
      currentStep = "suspended";
    } else {
      currentStep = "pending";
    }

    return {
      currentStep,
      status: profile.status as DriverProfile["status"],
      profileCompleted: true,
      documentsCompleted: true,
      availabilityCompleted: true,
      uploadedDocuments,
      missingDocuments: [],
    };
  }

  // ── T0.40: Update availability / pricing ───────────────────────────────────

  async updateAvailability(
    userId: string,
    dto: UpdateDriverAvailability,
  ): Promise<DriverProfile> {
    const env = getEnv();

    // Fetch existing profile
    const existing = await this.getMyProfile(userId);

    // Enforce price guardrails
    if (dto.basePriceCents !== undefined) {
      if (dto.basePriceCents < env.DRIVER_PRICE_MIN_CENTS) {
        throw new UnprocessableEntityException(
          `basePriceCents must be at least ${env.DRIVER_PRICE_MIN_CENTS} (platform minimum)`,
        );
      }
      if (dto.basePriceCents > env.DRIVER_PRICE_MAX_CENTS) {
        throw new UnprocessableEntityException(
          `basePriceCents must be at most ${env.DRIVER_PRICE_MAX_CENTS} (platform maximum)`,
        );
      }
    }

    // Guard: cannot drop a day that still has active subscriptions
    if (dto.operatingDays !== undefined) {
      const currentDays = new Set(existing.operatingDays);
      const newDays = new Set(dto.operatingDays);
      const droppedDays = [...currentDays].filter((d) => !newDays.has(d));

      if (droppedDays.length > 0) {
        // Check for active subscriptions on dropped days
        // Subscriptions don't store operating_days directly, but DriverScheduleSlots do
        const slotsConflict = (await this.prisma.sql`
          SELECT COUNT(*) AS cnt
          FROM driver_schedule_slots dss
          JOIN subscriptions s ON s.id = dss.subscription_id
          WHERE dss.driver_profile_id = ${existing.id}
            AND s.status = 'ACTIVE'
            AND dss.operating_days && ${`{${droppedDays.join(",")}}`}::smallint[]
        `) as unknown as { cnt: string }[];

        if (parseInt(slotsConflict[0]?.cnt ?? "0", 10) > 0) {
          throw new ConflictException(
            "Cannot remove operating days that have active subscriptions",
          );
        }
      }
    }

    const daysLiteral = dto.operatingDays
      ? `{${dto.operatingDays.join(",")}}`
      : null;

    const rows = (await mutateDriverProfile(
      this.prisma,
      userId,
      dto.operatingDays !== undefined,
      async (sql) => {
        if (dto.operatingDays) {
          const offered = await sql<{ operating_day: number }>`
            SELECT DISTINCT operating_day FROM driver_availability WHERE driver_profile_id = ${existing.id}
          `;
          const offeredDays = new Set(offered.map((row) => row.operating_day));
          if (
            offeredDays.size &&
            (offeredDays.size !== dto.operatingDays.length ||
              dto.operatingDays.some((day) => !offeredDays.has(day)))
          ) {
            throw new ConflictException(
              "Change offered days and leg windows together in service-area settings",
            );
          }
        }
        return sql`
      UPDATE driver_profiles
      SET
        operating_days = COALESCE(
          ${daysLiteral}::smallint[],
          operating_days
        ),
        base_price_cents = COALESCE(
          ${dto.basePriceCents ?? null}::integer,
          base_price_cents
        ),
        availability_version = availability_version + 1,
        updated_at = NOW()
      WHERE user_id = ${userId}
      RETURNING
        id, user_id, licence_number, vehicle_make, vehicle_model, vehicle_year,
        vehicle_colour, plate_number, seat_capacity, operating_days,
        base_price_cents, currency, status, verification_tier,
        acceptance_rate, created_at, updated_at
    `;
      },
    )) as unknown as DriverProfileRow[];

    return rowToProfile(rows[0]!);
  }

  // ── T0.39: Update route polyline ───────────────────────────────────────────

  async updateRoute(
    userId: string,
    geojson: { type: "LineString"; coordinates: [number, number][] },
  ): Promise<DriverProfile> {
    const env = getEnv();

    // Fetch profile (throws 404 if missing)
    const existing = await this.getMyProfile(userId);

    // Bbox check: every coordinate must be inside the launch city bbox
    const {
      LAUNCH_CITY_BBOX_MIN_LAT,
      LAUNCH_CITY_BBOX_MAX_LAT,
      LAUNCH_CITY_BBOX_MIN_LON,
      LAUNCH_CITY_BBOX_MAX_LON,
    } = env;

    const outOfBounds = geojson.coordinates.some(
      ([lon, lat]) =>
        lat < LAUNCH_CITY_BBOX_MIN_LAT ||
        lat > LAUNCH_CITY_BBOX_MAX_LAT ||
        lon < LAUNCH_CITY_BBOX_MIN_LON ||
        lon > LAUNCH_CITY_BBOX_MAX_LON,
    );
    if (outOfBounds) {
      throw new UnprocessableEntityException(
        `Route coordinates must fall within the ${env.LAUNCH_CITY_NAME} service area`,
      );
    }

    const geojsonString = JSON.stringify(geojson);

    // Validate with PostGIS ST_IsValid and store
    const rows = (await mutateDriverProfile(
      this.prisma,
      userId,
      true,
      async (sql) => {
        const geometry = await sql<{ valid: boolean }>`
        SELECT ST_IsValid(g) AND ST_IsSimple(g) AND NOT ST_IsEmpty(g)
          AND ST_GeometryType(g) = 'ST_LineString' AS valid
        FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geojsonString}),4326) g) route
      `;
        if (!geometry[0]?.valid)
          throw new UnprocessableEntityException(
            "Route must be a valid simple LineString",
          );
        return sql`
      UPDATE driver_profiles
      SET
        route_polyline = ST_SetSRID(ST_GeomFromGeoJSON(${geojsonString}), 4326),
        route_state = 'ESTABLISHED',
        availability_version = availability_version + 1,
        updated_at = NOW()
      WHERE user_id = ${userId}
      RETURNING
        id, user_id, licence_number, vehicle_make, vehicle_model, vehicle_year,
        vehicle_colour, plate_number, seat_capacity, operating_days,
        base_price_cents, currency, status, verification_tier,
        acceptance_rate, created_at, updated_at
    `;
      },
    )) as unknown as DriverProfileRow[];

    if (rows.length === 0) {
      throw new NotFoundException("Driver profile not found");
    }

    this.logger.log({
      event: "driver.route_updated",
      driverProfileId: existing.id,
    });

    return rowToProfile(rows[0]!);
  }
  // ── Location-search route update ────────────────────────────────────────

  /**
   * Accepts an ordered list of resolved locations from the mobile client
   * (each location was resolved via the /maps/place-details proxy), builds
   * a multi-point GeoJSON LineString, and delegates to updateRoute for
   * bbox validation and storage.
   *
   * The coordinates are already geocoded on the client side — no extra
   * geocoding step is needed here.
   */
  async setRouteFromLocations(
    userId: string,
    dto: SetDriverRouteFromLocations,
  ): Promise<DriverProfile> {
    const geojson = {
      type: "LineString" as const,
      coordinates: dto.locations.map((l) => [l.lng, l.lat] as [number, number]),
    };

    this.logger.log({
      event: "driver.route_from_locations",
      userId,
      locationCount: dto.locations.length,
    });

    return this.updateRoute(userId, geojson);
  }
}

import { randomUUID } from "node:crypto";
import pg from "pg";
import type { RequestSubscriptionV2 } from "@routeride/contracts";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { SubscriptionsService } from "../src/subscriptions/subscriptions.service.js";
import {
  IdempotencyService,
  requestHash,
} from "../src/subscriptions/idempotency.service.js";
import { RequestabilityService } from "../src/subscriptions/requestability.service.js";
import { PublicProfileService } from "../src/drivers/public-profile.service.js";

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    LAUNCH_CITY_BBOX_MIN_LAT: 24.7,
    LAUNCH_CITY_BBOX_MAX_LAT: 25.15,
    LAUNCH_CITY_BBOX_MIN_LON: 66.85,
    LAUNCH_CITY_BBOX_MAX_LON: 67.35,
  }),
}));

describe("pending requests on the actual migrated public schema", () => {
  it("leaves existing subscriptions unchanged and stores honest unbilled terms while public capacity stays free", async () => {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString || !/test/i.test(new URL(connectionString).pathname))
      throw new Error("Dedicated migrated test database required");
    const pool = new pg.Pool({
      connectionString,
      options: "-c search_path=public",
    });
    const actor = randomUUID(),
      driverUser = randomUUID(),
      driver = randomUUID(),
      consumer = randomUUID(),
      rider = randomUUID(),
      key = randomUUID();
    const prisma = new PrismaService();
    prisma.pool = pool;
    const eligibility = new RequestabilityService();
    const service = new SubscriptionsService(
      prisma,
      new IdempotencyService(),
      eligibility,
    );
    const profile = new PublicProfileService(prisma, eligibility);
    const terms: RequestSubscriptionV2 = {
      riderId: rider,
      driverProfileId: driver,
      type: "ONE_WAY",
      operatingDays: [1],
      startDate: "2099-01-01",
      legs: [
        {
          legType: "DEPARTURE",
          pickupLocation: { type: "Point", coordinates: [67.01, 24.81] },
          dropoffLocation: { type: "Point", coordinates: [67.08, 24.88] },
          pickupWindowStart: "07:00",
          pickupWindowEnd: "07:10",
          arrivalDeadline: "08:00",
        },
      ],
    };
    try {
      await pool.query(
        `INSERT INTO users(id,phone,role,status,full_name) VALUES
        ($1,$3,'CONSUMER','ACTIVE','Fixture consumer'),($2,$4,'DRIVER','ACTIVE','Fixture driver')`,
        [actor, driverUser, `fixture-${actor}`, `fixture-${driverUser}`],
      );
      await pool.query(
        `INSERT INTO consumer_profiles(id,user_id,emergency_contact_name,emergency_contact_phone)
        VALUES($1,$2,'Fixture contact','fixture-contact')`,
        [consumer, actor],
      );
      await pool.query(
        `INSERT INTO riders(id,consumer_profile_id,name,home_address_text,dest_address_text,home_location,dest_location)
        VALUES($1,$2,'Fixture rider','Fixture home','Fixture destination',ST_GeomFromText('POINT(67.01 24.81)',4326),ST_GeomFromText('POINT(67.08 24.88)',4326))`,
        [rider, consumer],
      );
      await pool.query(
        `INSERT INTO driver_profiles(id,user_id,licence_number,vehicle_make,vehicle_model,vehicle_year,
        vehicle_colour,plate_number,seat_capacity,operating_days,base_price_cents,status,service_area,starting_location,
        accepting_requests,coverage_setup_required,route_state) VALUES($1,$2,'fixture','Toyota','HiAce',2024,'White',$1,1,ARRAY[1]::smallint[],12345,'APPROVED',
        ST_GeomFromText('POLYGON((67 24.8,67.1 24.8,67.1 24.9,67 24.9,67 24.8))',4326),ST_GeomFromText('POINT(67.01 24.81)',4326),true,false,'UNSET')`,
        [driver, driverUser],
      );
      await pool.query(
        "INSERT INTO driver_availability(driver_profile_id,operating_day,window_start,window_end) VALUES($1,1,'06:00','10:00')",
        [driver],
      );
      // Keep an actual pre-v2 row in the world, with its original billing/date
      // fields and no request snapshot, while exercising the new handler.
      await pool.query(
        `INSERT INTO subscriptions(id,rider_id,driver_profile_id,type,status,monthly_price_cents,
        agreed_pickup_time,agreed_dropoff_time,pickup_address_text,dropoff_address_text,start_date,next_billing_date)
        VALUES($1,$2,$3,'DEPARTURE','CANCELLED',12345,'2026-10-01T07:00:00Z','2026-10-01T08:00:00Z',
        'Legacy home','Legacy destination','2026-10-01','2026-11-01')`,
        [randomUUID(), rider, driver],
      );
      const before = await pool.query(
        "SELECT id,to_jsonb(s) AS snapshot FROM subscriptions s ORDER BY id",
      );
      const context = {
        riderId: rider,
        day: 1,
        departureTime: "07:00",
        subscriptionType: "ONE_WAY" as const,
        page: 1,
        pageSize: 20,
      };
      const prior = await profile.get(actor, driver, context, 1);
      expect(prior.driver).toMatchObject({
        availableSeats: 1,
        routeState: "UNSET",
        pickupDistanceMeters: null,
        destDistanceMeters: null,
      });
      const response = await service.create(actor, key, terms);
      const stored = (
        await pool.query("SELECT * FROM subscriptions WHERE id=$1", [
          response.id,
        ])
      ).rows[0];
      expect(stored).toMatchObject({
        status: "PENDING",
        requested_terms: terms,
        agreed_pickup_time: null,
        agreed_dropoff_time: null,
        agreed_pickup_location: null,
        agreed_dropoff_location: null,
        pickup_address_text: null,
        dropoff_address_text: null,
        next_billing_date: null,
      });
      expect(
        Date.parse(response.responseDeadline) - Date.parse(response.createdAt),
      ).toBe(86400000);
      expect(
        (await profile.get(actor, driver, context, 1)).driver.availableSeats,
      ).toBe(1);
      const after = await pool.query(
        "SELECT id,to_jsonb(s) AS snapshot FROM subscriptions s WHERE id<>$1 ORDER BY id",
        [response.id],
      );
      expect(after.rows).toEqual(before.rows);
      for (const table of [
        "run_assignments",
        "driver_schedule_slots",
        "payments",
      ]) {
        expect(
          (
            await pool.query(
              `SELECT COUNT(*)::int AS count FROM ${table} WHERE subscription_id=$1`,
              [response.id],
            )
          ).rows[0]?.count,
        ).toBe(0);
      }
    } finally {
      await pool.query("DELETE FROM idempotency_keys WHERE key=$1", [
        `subscription-request:${requestHash(["POST /subscriptions", actor, key])}`,
      ]);
      await pool.query("DELETE FROM subscriptions WHERE rider_id=$1", [rider]);
      await pool.query(
        "DELETE FROM driver_availability WHERE driver_profile_id=$1",
        [driver],
      );
      await pool.query("DELETE FROM riders WHERE id=$1", [rider]);
      await pool.query("DELETE FROM driver_profiles WHERE id=$1", [driver]);
      await pool.query("DELETE FROM consumer_profiles WHERE id=$1", [consumer]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::text[])", [
        [actor, driverUser],
      ]);
      await pool.end();
    }
  });
});

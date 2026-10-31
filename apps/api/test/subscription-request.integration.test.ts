import { randomUUID } from "node:crypto";
import pg from "pg";
import { SubscriptionsService } from "../src/subscriptions/subscriptions.service.js";
import {
  IdempotencyService,
  requestHash,
} from "../src/subscriptions/idempotency.service.js";
import { RequestabilityService } from "../src/subscriptions/requestability.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import type { RequestSubscriptionV2 } from "@routeride/contracts";

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    LAUNCH_CITY_BBOX_MIN_LAT: 24.7,
    LAUNCH_CITY_BBOX_MAX_LAT: 25.15,
    LAUNCH_CITY_BBOX_MIN_LON: 66.85,
    LAUNCH_CITY_BBOX_MAX_LON: 67.35,
  }),
}));

describe("pending subscription requests in PostGIS", () => {
  const schema = `request_${randomUUID().replaceAll("-", "")}`;
  const actor = randomUUID(),
    driver = randomUUID(),
    rider = randomUUID();
  let admin: pg.Client, pool: pg.Pool, service: SubscriptionsService;
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
  beforeAll(async () => {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString || !/test/i.test(new URL(connectionString).pathname))
      throw new Error("Dedicated test database required");
    admin = new pg.Client({ connectionString });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({
      connectionString,
      options: `-c search_path=${schema},public`,
    });
    await pool.query(`CREATE TABLE consumer_profiles(id text PRIMARY KEY,user_id text);
      CREATE TABLE riders(id text PRIMARY KEY,consumer_profile_id text REFERENCES consumer_profiles(id));
      CREATE TABLE driver_profiles(id text PRIMARY KEY,status text,accepting_requests boolean,coverage_setup_required boolean,
        service_area geometry,starting_location geometry,route_state text,route_polyline geometry,operating_city text,
        seat_capacity int,base_price_cents int,currency text);
      CREATE TABLE driver_availability(driver_profile_id text,operating_day smallint,window_start time,window_end time);
      CREATE TABLE recurring_runs(id text PRIMARY KEY,driver_profile_id text,operating_day smallint,leg_type text,
        needs_review boolean,effective_to date,seat_capacity int,starts_at time,ends_at time);
      CREATE TABLE run_assignments(run_id text,subscription_id text,effective_to date);
      CREATE TABLE subscriptions(id text PRIMARY KEY,rider_id text,driver_profile_id text,type text,
        monthly_price_cents int,currency text,status text,start_date date,requested_terms jsonb,response_deadline timestamptz,
        next_billing_date date,created_at timestamptz,updated_at timestamptz);
      CREATE TABLE idempotency_keys(key text PRIMARY KEY,request_hash text,state text,response jsonb,
        created_at timestamptz DEFAULT now(),expires_at timestamptz);
      CREATE TABLE driver_schedule_slots(id text);
      CREATE TABLE payments(id text);`);
    await pool.query("INSERT INTO consumer_profiles VALUES($1,$1)", [actor]);
    await pool.query("INSERT INTO riders VALUES($1,$2)", [rider, actor]);
    await pool.query(
      `INSERT INTO driver_profiles VALUES($1,'APPROVED',true,false,
      ST_GeomFromText('POLYGON((67 24.8,67.1 24.8,67.1 24.9,67 24.9,67 24.8))',4326),
      ST_GeomFromText('POINT(67.01 24.81)',4326),'UNSET',NULL,'PK-KHI',1,12345,'PKR');`,
      [driver],
    );
    await pool.query(
      "INSERT INTO driver_availability VALUES($1,1,'06:00','10:00')",
      [driver],
    );
    const prisma = new PrismaService();
    prisma.pool = pool;
    service = new SubscriptionsService(
      prisma,
      new IdempotencyService(),
      new RequestabilityService(),
    );
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE subscriptions,idempotency_keys,run_assignments,recurring_runs",
    );
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });
  it("records requested terms and a 24h deadline without allocating seats, runs or billing", async () => {
    const result = await service.create(actor, "one", terms);
    expect(result).toMatchObject({
      status: "PENDING",
      requestedTerms: terms,
      monthlyPriceCents: 12345,
      reviewStatus: "REQUIRED",
    });
    expect(
      Date.parse(result.responseDeadline) - Date.parse(result.createdAt),
    ).toBe(86400000);
    expect(
      (await pool.query("SELECT next_billing_date FROM subscriptions")).rows[0]
        ?.next_billing_date,
    ).toBeNull();
    for (const table of [
      "driver_schedule_slots",
      "recurring_runs",
      "run_assignments",
      "payments",
    ]) {
      expect(
        (await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`))
          .rows[0]?.count,
      ).toBe(0);
    }
    expect(await service.create(actor, "one", terms)).toEqual(result);
    await expect(
      service.create(actor, "one", { ...terms, startDate: "2099-01-02" }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("concurrent identical keys create exactly one request, with replay or in-flight conflict", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        service.create(actor, "concurrent", terms),
      ),
    );
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    for (const result of results)
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ status: 409 });
    expect(
      (await pool.query("SELECT COUNT(*)::int AS count FROM subscriptions"))
        .rows[0]?.count,
    ).toBe(1);
  });
  it("reports an in-flight advisory claim immediately and permits retry after rollback", async () => {
    const client = await pool.connect();
    await client.query("BEGIN");
    await new IdempotencyService().claim(client, actor, "held", terms);
    await expect(service.create(actor, "held", terms)).rejects.toMatchObject({
      status: 409,
    });
    await client.query("ROLLBACK");
    client.release();
    await expect(service.create(actor, "held", terms)).resolves.toMatchObject({
      status: "PENDING",
    });
  });
  it("allows different pending riders for a single seat and blocks duplicate intent", async () => {
    const second = randomUUID();
    await pool.query("INSERT INTO riders VALUES($1,$2)", [second, actor]);
    await Promise.all([
      service.create(actor, "first", terms),
      service.create(actor, "second", { ...terms, riderId: second }),
    ]);
    await expect(
      service.create(actor, "duplicate", terms),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await pool.query("SELECT COUNT(*)::int AS count FROM subscriptions"))
        .rows[0]?.count,
    ).toBe(2);
  });
  it("rejects cross-owner riders, endpoints outside the city and unavailable days", async () => {
    await expect(
      service.create(randomUUID(), "owner", terms),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.create(actor, "day", { ...terms, operatingDays: [1, 2] }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.create(actor, "outside", {
        ...terms,
        legs: [
          {
            ...terms.legs[0]!,
            dropoffLocation: { type: "Point", coordinates: [67.4, 24.88] },
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      (await pool.query("SELECT COUNT(*)::int AS count FROM subscriptions"))
        .rows[0]?.count,
    ).toBe(0);
  });
  it("allows a request outside the driver's historical polygon within the city", async () => {
    await expect(
      service.create(actor, "outside-old-area", {
        ...terms,
        legs: [
          {
            ...terms.legs[0]!,
            dropoffLocation: { type: "Point", coordinates: [67.2, 24.88] },
          },
        ],
      }),
    ).resolves.toMatchObject({ status: "PENDING", reviewStatus: "REQUIRED" });
  });
  it("expires idempotency claims and scopes keys by actor", async () => {
    const scoped = `subscription-request:${requestHash(["POST /subscriptions", actor, "expired"])}`;
    await pool.query(
      "INSERT INTO idempotency_keys(key,request_hash,state,expires_at) VALUES($1,'old','in_progress',now()-interval '1 second')",
      [scoped],
    );
    await expect(
      service.create(actor, "expired", terms),
    ).resolves.toMatchObject({ status: "PENDING" });
    await expect(
      service.create(randomUUID(), "expired", terms),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("validates the return leg, every availability deadline and known full-run capacity", async () => {
    const round: RequestSubscriptionV2 = {
      ...terms,
      type: "ROUND_TRIP",
      legs: [
        terms.legs[0]!,
        {
          legType: "PICKUP",
          pickupLocation: terms.legs[0]!.dropoffLocation,
          dropoffLocation: terms.legs[0]!.pickupLocation,
          pickupWindowStart: "14:00",
          pickupWindowEnd: "14:10",
          arrivalDeadline: "15:00",
        },
      ],
    };
    await expect(
      service.create(actor, "missing-return", round),
    ).rejects.toMatchObject({ status: 422 });
    await pool.query(
      "INSERT INTO driver_availability VALUES($1,1,'13:00','16:00')",
      [driver],
    );
    await expect(
      service.create(actor, "late-deadline", {
        ...terms,
        legs: [{ ...terms.legs[0]!, arrivalDeadline: "11:00" }],
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.create(actor, "outside-return", {
        ...round,
        legs: [
          round.legs[0]!,
          {
            ...round.legs[1]!,
            dropoffLocation: { type: "Point", coordinates: [67.4, 24.88] },
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 422 });
    const active = randomUUID(),
      run = randomUUID();
    await pool.query(
      "INSERT INTO subscriptions(id,status) VALUES($1,'ACTIVE')",
      [active],
    );
    await pool.query(
      "INSERT INTO recurring_runs VALUES($1,$2,1,'PICKUP',false,NULL,1,'13:00','16:00')",
      [run, driver],
    );
    await pool.query("INSERT INTO run_assignments VALUES($1,$2,NULL)", [
      run,
      active,
    ]);
    await expect(
      service.create(actor, "full-return", round),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.create(actor, "morning-free", terms),
    ).resolves.toMatchObject({ status: "PENDING" });
  });
});

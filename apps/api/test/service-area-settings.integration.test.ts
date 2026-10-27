import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { ServiceAreaService } from "../src/drivers/service-area.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import type { DriverServiceAreaSettings } from "@routeride/contracts";
import {
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    LAUNCH_CITY_BBOX_MIN_LAT: 24.7,
    LAUNCH_CITY_BBOX_MAX_LAT: 25.15,
    LAUNCH_CITY_BBOX_MIN_LON: 66.85,
    LAUNCH_CITY_BBOX_MAX_LON: 67.35,
  }),
}));

describe("service-area settings against PostGIS", () => {
  const schema = `settings_${randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let pool: pg.Pool | undefined;
  let service: ServiceAreaService;
  let created = false;
  const settings: DriverServiceAreaSettings = {
    serviceArea: {
      type: "Polygon",
      coordinates: [
        [
          [67, 24.8],
          [67.1, 24.8],
          [67.1, 24.9],
          [67, 24.9],
          [67, 24.8],
        ],
      ],
    },
    startingLocation: { type: "Point", coordinates: [67.01, 24.8] },
    routeState: "UNSET",
    routePolyline: null,
    acceptingRequests: true,
    availability: [
      { day: 1, startTime: "06:00", endTime: "10:00" },
    ],
  };

  beforeAll(async () => {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString || !/test/i.test(new URL(connectionString).pathname))
      throw new Error("Dedicated test database required");
    admin = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    pool = new pg.Pool({
      connectionString,
      options: `-c search_path=${schema},public`,
    });
    await pool.query(`
      CREATE TABLE driver_profiles(id text PRIMARY KEY,user_id text UNIQUE,route_polyline geometry(Geometry,4326),
        operating_days smallint[] NOT NULL,seat_capacity integer NOT NULL,updated_at timestamptz DEFAULT now());
      CREATE TABLE subscriptions(id text PRIMARY KEY,driver_profile_id text REFERENCES driver_profiles(id),
        status text NOT NULL,type text NOT NULL,start_date timestamptz NOT NULL,
        agreed_pickup_location geometry(Geometry,4326),agreed_dropoff_location geometry(Geometry,4326));
      CREATE TABLE driver_schedule_slots(subscription_id text,driver_profile_id text,operating_days smallint[],
        leg_type text,slot_start time,slot_end time);
      INSERT INTO driver_profiles VALUES('fresh','fresh-owner',NULL,ARRAY[1],3,now()),
        ('legacy','legacy-owner',NULL,ARRAY[1],3,now());
      INSERT INTO subscriptions VALUES('legacy-rider','legacy','ACTIVE','MORNING','2026-10-21',
        ST_GeomFromText('POINT(67.02 24.82)',4326),ST_GeomFromText('POINT(67.08 24.88)',4326));
      INSERT INTO driver_schedule_slots VALUES('legacy-rider','legacy',ARRAY[1],'MORNING','07:00','08:00');
    `);
    await pool.query(
      readFileSync(
        resolve("migrations/app/20261021T0458_service_area_runs/migration.sql"),
        "utf8",
      ),
    );
    await pool.query(`ALTER TABLE driver_availability
      DROP CONSTRAINT uq_driver_availability_day_leg;
      ALTER TABLE driver_availability DROP COLUMN leg_type;
      CREATE INDEX idx_driver_availability_day_window
        ON driver_availability(driver_profile_id,operating_day,window_start,window_end)`);
    const prisma = new PrismaService();
    prisma.pool = pool;
    service = new ServiceAreaService(prisma);
  });

  afterAll(async () => {
    await pool?.end();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.end();
  });

  it("saves a route-free driver's actual coverage and returns one consistent revision", async () => {
    await service.save("fresh-owner", settings);
    await expect(service.get("fresh-owner")).resolves.toMatchObject({
      settings,
      requiresSetup: false,
      availabilityVersion: 1,
      rosterVersion: 0,
    });
  });

  it("rejects a self-intersecting area without modifying persisted coverage", async () => {
    const invalid = structuredClone(settings);
    if (!invalid.serviceArea) throw new Error("Fixture must declare an area");
    invalid.serviceArea.coordinates = [
      [
        [67, 24.8],
        [67.1, 24.9],
        [67, 24.9],
        [67.08, 24.8],
        [67, 24.8],
      ],
    ];
    await expect(service.save("fresh-owner", invalid)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await expect(service.get("fresh-owner")).resolves.toMatchObject({
      settings,
      availabilityVersion: 1,
    });
  });

  it("allows additive legacy setup and switching incoming requests off without changing promises", async () => {
    await service.save("legacy-owner", settings);
    const pausedRequests = { ...settings, acceptingRequests: false };
    await service.save("legacy-owner", pausedRequests);
    await expect(service.get("legacy-owner")).resolves.toMatchObject({
      settings: pausedRequests,
      requiresSetup: false,
    });
    expect(
      (
        await pool!.query(
          "SELECT status FROM subscriptions WHERE id='legacy-rider'",
        )
      ).rows[0],
    ).toEqual({ status: "ACTIVE" });
  });

  it("rejects shrinking committed coverage or windows, including paused subscriptions", async () => {
    await pool!.query(
      "UPDATE subscriptions SET status='PAUSED' WHERE id='legacy-rider'",
    );
    const shorter = structuredClone(settings);
    shorter.availability[0]!.startTime = "07:30";
    await expect(service.save("legacy-owner", shorter)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const smaller = structuredClone(settings);
    if (!smaller.serviceArea) throw new Error("Fixture must declare an area");
    smaller.serviceArea.coordinates = [
      [
        [67, 24.8],
        [67.05, 24.8],
        [67.05, 24.9],
        [67, 24.9],
        [67, 24.8],
      ],
    ];
    await expect(service.save("legacy-owner", smaller)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

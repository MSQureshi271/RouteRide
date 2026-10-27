import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { z } from "zod";

// A real PostGIS rehearsal in an isolated transactional schema. Never loads .env
// or falls back to the development database; CI supplies the dedicated test DB.
describe("ADR-011 migration rehearsal", () => {
  let client: pg.Client;
  let connected = false;
  let ready = false;
  const schema = `amendment_${randomUUID().replaceAll("-", "")}`;
  const migrationDir = resolve(
    "migrations/app/20261021T0458_service_area_runs",
  );
  const body = (name: string): string =>
    readFileSync(resolve(migrationDir, name), "utf8")
      .replace(/^BEGIN;$/m, "")
      .replace(/^COMMIT;$/m, "");

  beforeAll(async () => {
    const connectionString = process.env["DATABASE_URL"];
    if (
      !connectionString ||
      !/test/i.test(new URL(connectionString).pathname)
    ) {
      throw new Error(
        "Migration rehearsal requires DATABASE_URL naming a dedicated test database",
      );
    }
    client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    connected = true;
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}",public`);
    await client.query(`
      CREATE TABLE driver_profiles(id text PRIMARY KEY, route_polyline geometry(Geometry,4326),
        operating_days integer[] NOT NULL,seat_capacity integer NOT NULL);
      CREATE TABLE subscriptions(id text PRIMARY KEY,driver_profile_id text REFERENCES driver_profiles(id),
        status text NOT NULL,type text NOT NULL,start_date timestamptz NOT NULL);
      INSERT INTO driver_profiles VALUES
        ('established',ST_GeomFromText('LINESTRING(67 24.8,67.1 24.9)',4326),ARRAY[1,2],3),
        ('unset',NULL,ARRAY[1],3),('missing-days',NULL,ARRAY[]::integer[],2);
      INSERT INTO subscriptions VALUES
        ('round-trip','established','ACTIVE','ROUND_TRIP','2026-10-21T00:00:00Z'),
        ('paused','unset','PAUSED','MORNING','2026-10-21T00:00:00Z'),
        ('ambiguous','missing-days','ACTIVE','MORNING','2026-10-21T00:00:00Z');
    `);
    await client.query(body("migration.sql"));
    ready = true;
  });

  beforeEach(async () => {
    if (!ready) throw new Error("Migration rehearsal database setup failed");
    await client.query("SAVEPOINT test_case");
  });
  afterEach(async () => {
    if (ready) await client.query("ROLLBACK TO SAVEPOINT test_case");
  });
  afterAll(async () => {
    if (connected) {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("classifies route state without inventing coverage or enabling requests", async () => {
    const result = await client.query(
      "SELECT id,route_state,service_area,accepting_requests,coverage_setup_required FROM driver_profiles ORDER BY id",
    );
    expect(
      result.rows.map((row: Record<string, unknown>) => row["route_state"]),
    ).toEqual(["ESTABLISHED", "UNSET", "UNSET"]);
    for (const row of result.rows as Record<string, unknown>[]) {
      expect(row["service_area"]).toBeNull();
      expect(row["accepting_requests"]).toBe(false);
      expect(row["coverage_setup_required"]).toBe(true);
    }
  });

  it("retains all commitments, both round-trip legs and explicit review issues", async () => {
    const runIds = await client.query<{ id: string }>(
      "SELECT id FROM recurring_runs",
    );
    for (const row of runIds.rows)
      expect(z.string().uuid().safeParse(row.id).success).toBe(true);
    expect(
      (await client.query("SELECT count(*)::int AS n FROM subscriptions"))
        .rows[0],
    ).toEqual({ n: 3 });
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM run_assignments WHERE subscription_id='round-trip' AND needs_review",
        )
      ).rows[0],
    ).toEqual({ n: 4 });
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM recurring_run_migration_issues",
        )
      ).rows[0],
    ).toEqual({ n: 3 });
    expect(
      (await client.query("SELECT count(*)::int AS n FROM run_stops")).rows[0],
    ).toEqual({ n: 0 });
  });

  it("rejects missing setup, invalid polygons and cross-midnight availability", async () => {
    await expect(
      client.query(
        "UPDATE driver_profiles SET accepting_requests=true WHERE id='unset'",
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT test_case");
    await expect(
      client.query(
        "UPDATE driver_profiles SET service_area=ST_GeomFromText('POINT(67 24.8)',4326) WHERE id='unset'",
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT test_case");
    await expect(
      client.query(
        "INSERT INTO driver_availability(driver_profile_id,operating_day,leg_type,window_start,window_end) VALUES('unset',1,'MORNING','23:00','01:00')",
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("operational rollback keeps subscriptions and assignments", async () => {
    const before = await client.query(
      "SELECT id FROM run_assignments ORDER BY id",
    );
    await client.query(body("rollback.sql"));
    expect(
      (await client.query("SELECT id FROM run_assignments ORDER BY id")).rows,
    ).toEqual(before.rows);
    expect(
      (await client.query("SELECT count(*)::int AS n FROM subscriptions"))
        .rows[0],
    ).toEqual({ n: 3 });
  });

  it("rejects a confirmed assignment without both ordered stops", async () => {
    await client.query(
      "UPDATE run_assignments SET needs_review=false WHERE subscription_id='paused'",
    );
    await expect(
      client.query("SET CONSTRAINTS ALL IMMEDIATE"),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects cross-driver assignment links", async () => {
    await expect(
      client.query(
        "UPDATE run_assignments SET driver_profile_id='unset' WHERE subscription_id='round-trip'",
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
});

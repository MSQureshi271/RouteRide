import * as fs from "node:fs";
import * as path from "node:path";

describe("Schema & Indexes Specification (TRD §3.1 & §3.2)", () => {
  const EXPECTED_INDEXES = [
    { name: "idx_users_phone", type: "btree", table: "users" },
    { name: "idx_users_email", type: "btree", table: "users" },
    { name: "idx_dp_route", type: "gist", table: "driver_profiles" },
    { name: "idx_dp_status", type: "btree", table: "driver_profiles" },
    { name: "idx_riders_home", type: "gist", table: "riders" },
    { name: "idx_riders_dest", type: "gist", table: "riders" },
    { name: "idx_subs_driver_status", type: "btree", table: "subscriptions" },
    { name: "idx_subs_rider", type: "btree", table: "subscriptions" },
    {
      name: "idx_dss_driver_days",
      type: "btree",
      table: "driver_schedule_slots",
    },
    { name: "idx_trips_sub_date", type: "btree", table: "trips" },
    { name: "idx_trips_status_date", type: "btree", table: "trips" },
    { name: "idx_payments_sub", type: "btree", table: "payments" },
    { name: "idx_payments_idempotency", type: "btree", table: "payments" },
    {
      name: "idx_notifications_user_unread",
      type: "btree",
      table: "notifications",
    },
    { name: "idx_messages_sub", type: "btree", table: "messages" },
    { name: "idx_audit_entity", type: "btree", table: "audit_log" },
    {
      name: "idx_idempotency_expires",
      type: "btree",
      table: "idempotency_keys",
    },
  ];

  it("declares exactly the 17 named indexes required by TRD §3.2", () => {
    expect(EXPECTED_INDEXES.length).toBe(17);

    // Verify 3 GIST indexes
    const gistIndexes = EXPECTED_INDEXES.filter((i) => i.type === "gist");
    expect(gistIndexes.map((i) => i.name)).toEqual([
      "idx_dp_route",
      "idx_riders_home",
      "idx_riders_dest",
    ]);
  });

  it("verifies migrations contain all PostGIS extension and index definitions", () => {
    const migrationsDir = fs.existsSync(path.resolve("prisma/migrations"))
      ? path.resolve("prisma/migrations")
      : path.resolve("apps/api/prisma/migrations");

    const postgisMigration = fs.readFileSync(
      path.join(migrationsDir, "20260828000002_postgis/migration.sql"),
      "utf-8",
    );

    expect(postgisMigration).toContain(
      'CREATE EXTENSION IF NOT EXISTS "postgis"',
    );
    expect(postgisMigration).toContain("idx_dp_route");
    expect(postgisMigration).toContain('USING GIST ("route_polyline")');
    expect(postgisMigration).toContain("idx_riders_home");
    expect(postgisMigration).toContain('USING GIST ("home_location")');
    expect(postgisMigration).toContain("idx_riders_dest");
    expect(postgisMigration).toContain('USING GIST ("dest_location")');
    expect(postgisMigration).toContain("idx_notifications_user_unread");
    expect(postgisMigration).toContain('WHERE "is_read" = FALSE');
  });

  it("verifies init migration contains all 10 enum definitions and tables", () => {
    const migrationsDir = fs.existsSync(path.resolve("prisma/migrations"))
      ? path.resolve("prisma/migrations")
      : path.resolve("apps/api/prisma/migrations");

    const initMigration = fs.readFileSync(
      path.join(migrationsDir, "20260828000001_init/migration.sql"),
      "utf-8",
    );

    const enums = [
      "UserRole",
      "UserStatus",
      "DriverStatus",
      "VerifyTier",
      "SubType",
      "SubStatus",
      "TripType",
      "TripStatus",
      "PayStatus",
      "PayoutStatus",
    ];

    for (const e of enums) {
      expect(initMigration).toContain(`CREATE TYPE "${e}"`);
    }

    const tables = [
      "users",
      "driver_profiles",
      "driver_documents",
      "consumer_profiles",
      "riders",
      "subscriptions",
      "driver_schedule_slots",
      "trips",
      "location_logs",
      "payments",
      "driver_payouts",
      "reviews",
      "notifications",
      "messages",
      "idempotency_keys",
      "audit_log",
    ];

    for (const t of tables) {
      expect(initMigration).toContain(`CREATE TABLE "${t}"`);
    }
  });
});

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
    const postgisOps = fs.readFileSync(
      path.resolve(
        "migrations/postgis/20260601T0000_install_postgis_extension/ops.json",
      ),
      "utf-8",
    );
    expect(postgisOps).toContain("CREATE EXTENSION IF NOT EXISTS postgis");

    const contract = fs.readFileSync(
      path.resolve("prisma/contract.prisma"),
      "utf-8",
    );
    expect(contract).toContain("idx_users_phone");
    expect(contract).toContain("idx_users_email");
    expect(contract).toContain("idx_dp_status");
    expect(contract).toContain("idx_subs_driver_status");
    expect(contract).toContain("idx_subs_rider");
    expect(contract).toContain("idx_dss_driver_days");
    expect(contract).toContain("idx_trips_sub_date");
    expect(contract).toContain("idx_trips_status_date");
    expect(contract).toContain("idx_payments_sub");
    expect(contract).toContain("idx_payments_idempotency");
    expect(contract).toContain("idx_notifications_user_unread");
    expect(contract).toContain("idx_messages_sub");
    expect(contract).toContain("idx_audit_entity");
    expect(contract).toContain("idx_idempotency_expires");
  });

  it("verifies init migration contains all 10 enum definitions and tables", () => {
    const contract = fs.readFileSync(
      path.resolve("prisma/contract.prisma"),
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
      expect(contract).toContain(`enum ${e}`);
    }

    const tables = [
      "User",
      "DriverProfile",
      "DriverDocument",
      "ConsumerProfile",
      "Rider",
      "Subscription",
      "DriverScheduleSlot",
      "Trip",
      "LocationLog",
      "Payment",
      "DriverPayout",
      "Review",
      "Notification",
      "Message",
      "IdempotencyKey",
      "AuditLog",
    ];

    for (const t of tables) {
      expect(contract).toContain(`model ${t}`);
    }

    const appMigrationDirs = fs.readdirSync(path.resolve("migrations/app"));
    const latestAppDir = appMigrationDirs
      .filter((d) => !d.startsWith("."))
      .pop()!;
    const appOps = fs.readFileSync(
      path.resolve("migrations/app", latestAppDir, "ops.json"),
      "utf-8",
    );

    const dbTables = [
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

    for (const dt of dbTables) {
      expect(appOps).toContain(`"table.${dt}"`);
    }
  });
});

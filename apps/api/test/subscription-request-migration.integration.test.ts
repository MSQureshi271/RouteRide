import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { z } from "zod";

const OperationsSchema = z.array(
  z.object({
    execute: z.array(
      z.object({ sql: z.string(), params: z.array(z.unknown()).optional() }),
    ),
  }),
);

describe("pending request migration", () => {
  const schema = `pending_schema_${randomUUID().replaceAll("-", "")}`;
  let client: pg.Client;
  let connected = false;
  let ready = false;
  let legacyRows: unknown;

  beforeAll(async () => {
    const connectionString = process.env["DATABASE_URL"];
    if (
      !connectionString ||
      !/test/i.test(new URL(connectionString).pathname)
    ) {
      throw new Error("A dedicated test DATABASE_URL is required");
    }
    client = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
    await client.connect();
    connected = true;
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`CREATE TABLE subscriptions (
      id text PRIMARY KEY, rider_id text NOT NULL DEFAULT 'rider',
      driver_profile_id text NOT NULL DEFAULT 'driver', status text NOT NULL DEFAULT 'PENDING',
      agreed_pickup_time timestamptz NOT NULL, agreed_dropoff_time timestamptz NOT NULL,
      pickup_address_text text NOT NULL, dropoff_address_text text NOT NULL,
      next_billing_date timestamptz NOT NULL
    )`);
    for (const status of ["ACTIVE", "PENDING", "CANCELLED"]) {
      await client.query(
        `INSERT INTO subscriptions(id,status,agreed_pickup_time,agreed_dropoff_time,
        pickup_address_text,dropoff_address_text,next_billing_date)
        VALUES($1,$2,'2026-10-21T02:00Z','2026-10-21T03:00Z','original pickup','original destination','2026-11-21T00:00Z')`,
        [status, status],
      );
    }
    legacyRows = (
      await client.query(
        "SELECT to_jsonb(s) AS snapshot FROM subscriptions s ORDER BY id",
      )
    ).rows;
    const operations = OperationsSchema.parse(
      JSON.parse(
        readFileSync(
          resolve(
            "migrations/app/20261022T1503_pending_subscription_requests/ops.json",
          ),
          "utf8",
        ),
      ),
    );
    for (const operation of operations) {
      for (const step of operation.execute) {
        await client.query(
          step.sql.replaceAll(
            '"public"."subscriptions"',
            `"${schema}"."subscriptions"`,
          ),
          step.params,
        );
      }
    }
    ready = true;
  }, 15000);

  beforeEach(async () => {
    if (!ready) throw new Error("Migration setup did not complete");
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

  it("preserves every legacy field including existing pending billing dates", async () => {
    const after = await client.query(
      "SELECT to_jsonb(s)-'requested_terms'-'response_deadline' AS snapshot FROM subscriptions s ORDER BY id",
    );
    expect(after.rows).toEqual(legacyRows);
  });

  it("stores pending terms and deadline without invented agreements or billing", async () => {
    const result = await client.query(
      `INSERT INTO subscriptions(id,requested_terms,response_deadline)
      VALUES($1,'{}',now()+interval '24 hours') RETURNING agreed_pickup_time,agreed_dropoff_time,
      pickup_address_text,dropoff_address_text,next_billing_date`,
      [randomUUID()],
    );
    expect(result.rows[0]).toEqual({
      agreed_pickup_time: null,
      agreed_dropoff_time: null,
      pickup_address_text: null,
      dropoff_address_text: null,
      next_billing_date: null,
    });
  });

  it.each([
    { terms: "[]", deadline: "2099-01-01T00:00Z", billing: null },
    { terms: "{}", deadline: null, billing: null },
    { terms: null, deadline: "2099-01-01T00:00Z", billing: null },
    {
      terms: "{}",
      deadline: "2099-01-01T00:00Z",
      billing: "2099-01-02T00:00Z",
    },
  ])(
    "rejects inconsistent new request metadata %#",
    async ({ terms, deadline, billing }) => {
      await expect(
        client.query(
          `INSERT INTO subscriptions(id,requested_terms,response_deadline,next_billing_date)
      VALUES($1,$2::jsonb,$3,$4)`,
          [randomUUID(), terms, deadline, billing],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    },
  );
});

#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/4f73aaaae55fdb6f867be209c41a2d2bccfcf0ec90487757da1a42c452626275/contract";
import endContract from "../../snapshots/4f73aaaae55fdb6f867be209c41a2d2bccfcf0ec90487757da1a42c452626275/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/dd72d3ff87f47721ee4e6b6bc96119cc0b9a6e65819450f9af8b9926cc176c4d/contract";
import startContract from "../../snapshots/dd72d3ff87f47721ee4e6b6bc96119cc0b9a6e65819450f9af8b9926cc176c4d/contract.json" with { type: "json" };
import { Migration, MigrationCLI, col } from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: "public",
        table: "subscriptions",
        column: col("requested_terms", "jsonb", {
          codecRef: { codecId: "pg/jsonb@1" },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "subscriptions",
        column: col("response_deadline", "timestamptz", {
          codecRef: { codecId: "pg/timestamptz-temporal@1" },
        }),
      }),
      this.dropNotNull({
        schema: "public",
        table: "subscriptions",
        column: "agreed_dropoff_time",
      }),
      this.dropNotNull({
        schema: "public",
        table: "subscriptions",
        column: "agreed_pickup_time",
      }),
      this.dropNotNull({
        schema: "public",
        table: "subscriptions",
        column: "dropoff_address_text",
      }),
      this.dropNotNull({
        schema: "public",
        table: "subscriptions",
        column: "next_billing_date",
      }),
      this.dropNotNull({
        schema: "public",
        table: "subscriptions",
        column: "pickup_address_text",
      }),
      this.createIndex({
        schema: "public",
        table: "subscriptions",
        index: "idx_subs_response_deadline",
        columns: ["status", "response_deadline"],
      }),
      this.createIndex({
        schema: "public",
        table: "subscriptions",
        index: "idx_subs_rider_driver_status",
        columns: ["rider_id", "driver_profile_id", "status"],
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "subscriptions",
        constraint: "ck_subs_requested_terms_deadline",
        expression:
          "(requested_terms IS NULL AND response_deadline IS NULL) OR (requested_terms IS NOT NULL AND jsonb_typeof(requested_terms) = 'object' AND response_deadline IS NOT NULL)",
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "subscriptions",
        constraint: "ck_subs_pending_unbilled",
        expression:
          "requested_terms IS NULL OR status <> 'PENDING' OR next_billing_date IS NULL",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);

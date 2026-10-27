#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/b5c89f72e7d1e455f059cc746d1d7517ea4fa89c6b8d47246d3eb69ec7b5913f/contract";
import startContract from "../../snapshots/b5c89f72e7d1e455f059cc746d1d7517ea4fa89c6b8d47246d3eb69ec7b5913f/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/89abcac3ba2225484761b39a51eed191db4b581ca06f411414774f1e2ba39dbc/contract";
import endContract from "../../snapshots/89abcac3ba2225484761b39a51eed191db4b581ca06f411414774f1e2ba39dbc/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  rawSql,
} from "@prisma/orm-postgres/migration";

import { readFileSync } from "node:fs";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: "app.service-area-runs",
        label:
          "Add declared coverage and preserve legacy recurring commitments",
        operationClass: "additive",
        target: {
          id: "postgres",
          details: {
            schema: "public",
            objectType: "table",
            name: "recurring_runs",
          },
        },
        precheck: [
          {
            description: "Matching foundation SQL must be applied first",
            sql: "SELECT to_regclass('public.driver_matching_stats') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_schedule_slots' AND column_name='leg_type') AS result",
          },
        ],
        execute: [
          {
            description:
              "Apply ADR-011 additive schema and conservative backfill",
            sql: readFileSync(
              new URL("./migration.sql", import.meta.url),
              "utf8",
            )
              .replace(/^BEGIN;$/m, "")
              .replace(/^COMMIT;$/m, ""),
          },
        ],
        postcheck: [
          {
            description: "Confirm the legacy review ledger was created",
            sql: "SELECT to_regclass('public.recurring_run_migration_issues') IS NOT NULL AS result",
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);

#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/89abcac3ba2225484761b39a51eed191db4b581ca06f411414774f1e2ba39dbc/contract";
import startContract from "../../snapshots/89abcac3ba2225484761b39a51eed191db4b581ca06f411414774f1e2ba39dbc/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/dd72d3ff87f47721ee4e6b6bc96119cc0b9a6e65819450f9af8b9926cc176c4d/contract";
import endContract from "../../snapshots/dd72d3ff87f47721ee4e6b6bc96119cc0b9a6e65819450f9af8b9926cc176c4d/contract.json" with { type: "json" };
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import { readFileSync } from "node:fs";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: "app.align-existing-postgres-types",
        label: "Preserve established PostgreSQL types in the matching contract",
        operationClass: "destructive",
        target: {
          id: "postgres",
          details: {
            schema: "public",
            objectType: "table",
            name: "driver_matching_stats",
          },
        },
        precheck: [
          {
            description: "The service-area migration must be applied first",
            sql: "SELECT to_regclass('public.driver_matching_stats') IS NOT NULL AND to_regclass('public.driver_availability') IS NOT NULL AND to_regclass('public.recurring_runs') IS NOT NULL AND to_regclass('public.run_assignments') IS NOT NULL AND to_regclass('public.driver_schedule_slots') IS NOT NULL AS result",
          },
        ],
        execute: [
          {
            description: "Align columns without discarding existing time values",
            sql: readFileSync(new URL("./migration.sql", import.meta.url), "utf8")
              .replace(/^BEGIN;\s*$/m, "")
              .replace(/^COMMIT;\s*$/m, ""),
          },
        ],
        postcheck: [
          {
            description: "Confirm all matching columns use the contract types",
            sql: "SELECT (SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_matching_stats' AND column_name='operating_day')='int2' AND (SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_matching_stats' AND column_name='typical_departure_time')='time' AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('driver_schedule_slots','driver_availability','recurring_runs','run_assignments') AND column_name='leg_type' AND udt_name<>'ScheduleLegType') AS result",
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);

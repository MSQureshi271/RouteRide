#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/88ac2242793e95380c6c883b3a193d8df418825bb74de7d29c1cf4fe52513101/contract";
import startContract from "../../snapshots/88ac2242793e95380c6c883b3a193d8df418825bb74de7d29c1cf4fe52513101/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/09fd6c5776fd4aa1b2f52943f6f129c3d37c791e07729bc2767d28dd5f6367c1/contract";
import endContract from "../../snapshots/09fd6c5776fd4aa1b2f52943f6f129c3d37c791e07729bc2767d28dd5f6367c1/contract.json" with { type: "json" };
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import { readFileSync } from "node:fs";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: "app.schedule-slots-time",
        label: "Normalize schedule-slot times to local wall-clock values",
        operationClass: "destructive",
        target: {
          id: "postgres",
          details: { schema: "public", objectType: "table", name: "driver_schedule_slots" },
        },
        precheck: [],
        execute: [
          {
            description: "Apply the reviewed legacy SQL migration",
            sql: readFileSync(new URL("./migration.sql", import.meta.url), "utf8")
              .replace(/^BEGIN;\s*$/m, "")
              .replace(/^COMMIT;\s*$/m, ""),
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);

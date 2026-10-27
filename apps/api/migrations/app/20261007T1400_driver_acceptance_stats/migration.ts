#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/09fd6c5776fd4aa1b2f52943f6f129c3d37c791e07729bc2767d28dd5f6367c1/contract";
import startContract from "../../snapshots/09fd6c5776fd4aa1b2f52943f6f129c3d37c791e07729bc2767d28dd5f6367c1/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/675e2b128cc03bd0b1f6c69571326ba231fa3555992fd3008d18761891048d56/contract";
import endContract from "../../snapshots/675e2b128cc03bd0b1f6c69571326ba231fa3555992fd3008d18761891048d56/contract.json" with { type: "json" };
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import { readFileSync } from "node:fs";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: "app.driver-acceptance-stats",
        label: "Add driver request-acceptance counters",
        operationClass: "additive",
        target: {
          id: "postgres",
          details: { schema: "public", objectType: "table", name: "driver_profiles" },
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

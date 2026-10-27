#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/9e8f9d50fd4d2e25e57128014781419436909103596574a60bc5f4fa36db343e/contract";
import startContract from "../../snapshots/9e8f9d50fd4d2e25e57128014781419436909103596574a60bc5f4fa36db343e/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/88ac2242793e95380c6c883b3a193d8df418825bb74de7d29c1cf4fe52513101/contract";
import endContract from "../../snapshots/88ac2242793e95380c6c883b3a193d8df418825bb74de7d29c1cf4fe52513101/contract.json" with { type: "json" };
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import { readFileSync } from "node:fs";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: "app.matching-foundation",
        label: "Add matching statistics and schedule-leg classification",
        operationClass: "additive",
        target: {
          id: "postgres",
          details: { schema: "public", objectType: "table", name: "driver_matching_stats" },
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

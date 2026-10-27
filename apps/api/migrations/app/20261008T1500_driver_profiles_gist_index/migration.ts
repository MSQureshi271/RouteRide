#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/675e2b128cc03bd0b1f6c69571326ba231fa3555992fd3008d18761891048d56/contract";
import startContract from "../../snapshots/675e2b128cc03bd0b1f6c69571326ba231fa3555992fd3008d18761891048d56/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/b5c89f72e7d1e455f059cc746d1d7517ea4fa89c6b8d47246d3eb69ec7b5913f/contract";
import endContract from "../../snapshots/b5c89f72e7d1e455f059cc746d1d7517ea4fa89c6b8d47246d3eb69ec7b5913f/contract.json" with { type: "json" };
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import { readFileSync } from "node:fs";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: "app.driver-profile-gist-indexes",
        label: "Ensure geography-based driver and rider GiST indexes",
        operationClass: "destructive",
        target: {
          id: "postgres",
          details: { schema: "public", objectType: "table", name: "riders" },
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

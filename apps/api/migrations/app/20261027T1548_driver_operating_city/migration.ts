#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/031cf8fc8c99de5a470df726a72e99b7df7fd36c0ae361b2d908760ebdf48faa/contract";
import endContract from "../../snapshots/031cf8fc8c99de5a470df726a72e99b7df7fd36c0ae361b2d908760ebdf48faa/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/802a1be710051399c62b75b61b98ec6dc1415ca5ed41fb4601015296267f4ad7/contract";
import startContract from "../../snapshots/802a1be710051399c62b75b61b98ec6dc1415ca5ed41fb4601015296267f4ad7/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  col,
  rawSql,
} from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: "public",
        table: "driver_profiles",
        column: col("operating_city", "text", {
          codecRef: { codecId: "pg/text@1" },
        }),
      }),
      rawSql({
        id: "driver.operating-city.backfill",
        label: "Backfill the Karachi market and update request setup",
        operationClass: "additive",
        target: { id: "postgres" },
        precheck: [],
        execute: [
          {
            description:
              "Preserve existing coverage data and require city and starting location",
            sql: `UPDATE driver_profiles SET operating_city = 'PK-KHI' WHERE operating_city IS NULL;
            ALTER TABLE driver_profiles DROP CONSTRAINT ck_driver_request_setup;
            ALTER TABLE driver_profiles ADD CONSTRAINT ck_driver_request_setup CHECK
              (NOT accepting_requests OR (NOT coverage_setup_required AND operating_city IS NOT NULL AND starting_location IS NOT NULL))`,
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);

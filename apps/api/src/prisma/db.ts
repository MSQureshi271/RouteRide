import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import dotenv from "dotenv";
import postgres from "@prisma/orm-postgres/runtime";
import postgis from "@prisma/orm-extension-postgis/runtime";
import pg from "pg";
import type { Contract } from "../generated/prisma/contract.d";
import contractJson from "../generated/prisma/contract.json";

// Discover and load the nearest .env file (traverses upward to workspace root)
let dir = process.cwd();
for (let i = 0; i < 5; i++) {
  const candidate = resolve(dir, ".env");
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

const connectionString =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@localhost:5432/routeride?schema=public";

export const db = postgres<Contract>({
  url: connectionString,
  contractJson,
  extensions: [postgis],
});

const pool = new pg.Pool({ connectionString });

export async function sql<
  T extends pg.QueryResultRow = Record<string, unknown>,
>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
  let text = "";
  const params: unknown[] = [];
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  }
  const res = await pool.query<T>(text, params);
  return res.rows;
}

// Attach sql to db for seamless template literal execution in scripts (e.g., seed.ts)
(db as unknown as { sql: typeof sql }).sql = sql;

const originalClose = db.close.bind(db);
db.close = async () => {
  await pool.end();
  return originalClose();
};

export type DbClient = typeof db;

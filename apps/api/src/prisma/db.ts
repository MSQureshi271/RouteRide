import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import postgis from "@prisma/orm-extension-postgis/runtime";
import type { Contract } from "../generated/prisma/contract.d";
import contractJson from "../generated/prisma/contract.json";

export const db = postgres<Contract>({
  url:
    process.env["DATABASE_URL"] ??
    "postgresql://postgres:postgres@localhost:5432/routeride?schema=public",
  contractJson,
  extensions: [postgis],
});

export type DbClient = typeof db;

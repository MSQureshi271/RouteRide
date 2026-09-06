import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import dotenv from "dotenv";
import { definePrismaConfig } from "prisma/config";
import postgis from "@prisma/orm-extension-postgis/control";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

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

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./prisma/contract.prisma",
    output: "./src/generated/prisma",
    extensions: [postgis],
    db: {
      connection:
        process.env["DATABASE_URL"] ??
        "postgresql://postgres:postgres@localhost:5432/routeride?schema=public",
    },
  }),
});

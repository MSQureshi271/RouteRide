import "dotenv/config";
import { definePrismaConfig } from "prisma/config";
import postgis from "@prisma/orm-extension-postgis/control";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

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

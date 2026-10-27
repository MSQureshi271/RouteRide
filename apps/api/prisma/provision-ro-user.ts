/**
/**
 * Safe local/CI provisioning script for the RouteRide matching read-only login role.
 *
 * Rules:
 *  - Reads password from MATCHING_RO_PASSWORD env var (defaults to 'matching_ro_password_dev' for local testing).
 *  - Grants the NOLOGIN group role `routeride_matching_ro` to the login user `routeride_matching_user`.
 *  - Never hardcodes passwords in committed migrations.
 *
 * Run:
 *  pnpm --filter @routeride/api exec tsx prisma/provision-ro-user.ts
 */
import { db } from "../src/prisma/db";

async function provisionMatchingUser(): Promise<void> {
  const password =
    process.env["MATCHING_RO_PASSWORD"] || "matching_ro_password_dev";

  process.stdout.write("🔐 Provisioning read-only matching login user...\n");

  await db.sql`
    DO $$
    BEGIN
      -- Create the NOLOGIN role if migration hasn't already created it
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'routeride_matching_ro') THEN
        CREATE ROLE routeride_matching_ro NOLOGIN;
      END IF;

      -- Create the login user if not exists, and assign password
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'routeride_matching_user') THEN
        CREATE ROLE routeride_matching_user WITH LOGIN PASSWORD ${password};
      ELSE
        ALTER ROLE routeride_matching_user WITH PASSWORD ${password};
      END IF;

      GRANT SELECT ON driver_availability, recurring_runs, run_assignments, run_stops,
        recurring_run_migration_issues TO routeride_matching_ro;

      -- Grant the read-only role to the login user
      GRANT routeride_matching_ro TO routeride_matching_user;
    END $$;
  `;

  process.stdout.write(
    "✅ Successfully provisioned routeride_matching_user with routeride_matching_ro privileges.\n",
  );
}

provisionMatchingUser()
  .catch((err) => {
    process.stderr.write(`❌ Provisioning error: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });

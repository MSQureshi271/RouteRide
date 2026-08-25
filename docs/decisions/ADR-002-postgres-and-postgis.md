# ADR-002: PostgreSQL 16 + PostGIS 3.4 on RDS, with Prisma Raw SQL for Geography

## Status

Accepted

## Date

2026-08-23

## Context

RouteRide's core matching engine requires geospatial queries: determining whether a driver's route passes through a pickup and destination point within a configurable radius. The TRD §3.1 specifies a schema with `GEOGRAPHY(LINESTRING, 4326)` for route polylines and `GEOGRAPHY(POINT, 4326)` for rider pickup/destination coordinates, with GIST-indexed `ST_DWithin` as the hot path in the matching query (TRD §4.1 Step 1).

Two hosting options were evaluated:

1. **Amazon RDS PostgreSQL 16 with the PostGIS 3.4 extension** — the existing Terraform-managed VPC infrastructure path already specified in TRD §11.1.
2. **Supabase** — a managed PostgreSQL-as-a-service with built-in PostGIS and a REST/realtime API layer.

The ORM choice also requires a decision: **Prisma 5** (the TRD-specified ORM) has no native `GEOGRAPHY` type. All geospatial columns and indexes must be handled outside Prisma's schema DSL.

---

## Decision

**Use Amazon RDS PostgreSQL 16 with PostGIS 3.4, managed via Terraform. Use Prisma 5 as the ORM for all non-geography columns. All `GEOGRAPHY` columns, PostGIS extension installation, and GIST indexes are confined to a single dedicated raw-SQL migration file.**

### The raw-DDL boundary rule

> **Geography and GIST only in `prisma/migrations/*_postgis.sql`**

This is an enforced architectural rule, not a convention. The boundary means:

- Prisma's `schema.prisma` declares `GEOGRAPHY` columns as `Unsupported("geography")` with no Prisma-level access. Any column using a PostGIS type is marked `@ignore` in the schema.
- All `CREATE EXTENSION`, `ALTER TABLE ... ADD COLUMN geography(...)`, and `CREATE INDEX ... USING GIST` statements live in one migration file: `prisma/migrations/{timestamp}_postgis/migration.sql`.
- All `ST_*` function calls occur in raw SQL executed via `prisma.$queryRaw` or `prisma.$executeRaw`. They never appear in Prisma's generated query builder.
- A CI test queries `pg_indexes` to assert every GIST index named in TRD §3.2 exists, and a separate test asserts the extension is installed (`SELECT PostGIS_Version()`), so drift between the Prisma schema and the actual database is caught on every run.

---

## Alternatives Considered

### Supabase

**Pros:**
- Managed PostGIS with zero Terraform setup.
- Built-in Studio for schema inspection.
- Realtime subscription layer available out of the box.

**Cons and rejection rationale:**

1. **Terraform conflict.** TRD §11.1 already specifies RDS within a VPC with private subnets. Moving to Supabase strands the existing IaC, leaves the VPC with no database, and requires a second connectivity model for the admin API (which must be VPC-only per the security posture). Re-platforming the infrastructure at Gate D, before any code exists, is a higher-risk change than confirming the TRD assumption.

2. **Realtime duplication.** Socket.IO + Redis (ADR-004) already handles all realtime fan-out. Supabase's realtime layer would be a second source of truth for trip status with no consumer — exactly the simplicity violation that ADR-008 already named and rejected for Firebase RTDB.

3. **Connection pooling boundary.** Supabase uses PgBouncer in front of Postgres; the TRD's SERIALIZABLE transaction for conflict detection (T1.16) requires a direct connection per transaction, not a PgBouncer session-mode connection. Supabase's transaction-mode pooler does not support SERIALIZABLE. Working around this is non-trivial and its behaviour under load is not well-documented.

4. **Vendor lock-in vs. reversibility.** RDS behind Terraform is portable: the same Terraform modules deploy to any AWS region. Supabase has a migration path out but requires re-exporting data and re-writing the connection model. The infrastructure-reversibility constraint from the architectural review favours RDS.

**Rejected.** The VPC topology, the SERIALIZABLE isolation requirement, and the realtime duplication all independently block Supabase. Any one would be sufficient reason.

### DrizzleORM instead of Prisma

Not evaluated at this gate. Prisma 5 is already specified in the TRD (§2.2) and the raw-DDL boundary rule fully resolves Prisma's geography limitation without requiring an ORM change. Revisit only if Prisma's migration tooling produces unacceptable friction for PostGIS operations.

---

## Consequences

### Hosting and operations

- **RDS PostgreSQL 16 Multi-AZ** in staging and production (`db.t4g.micro` for staging, `db.r7g.large` for production — to be confirmed at T0.20).
- **Automated backups** enabled with a 7-day retention window. Point-in-time recovery available.
- **Multi-AZ standby** in production: automatic failover in < 120 seconds. RTO target is 2 minutes, RPO target is 0 (synchronous replication to standby).
- **Encryption at rest** using AWS KMS-managed keys. **Encryption in transit** enforced via `ssl-mode=verify-full` on all connections.
- The database is in a **private subnet** with no public endpoint. All connections originate from within the VPC. The admin API uses a bastion or AWS Systems Manager Session Manager for maintenance access, never a public RDS endpoint.
- Performance Insights enabled in production for slow-query detection.

### Prisma and raw-SQL boundary

- `schema.prisma` uses `Unsupported("geography")` for all PostGIS columns. These columns are declared with `@ignore` so Prisma does not generate accessor code for them.
- Geography reads and writes go through `prisma.$queryRaw` tagged template literals. Every such call is wrapped in a typed accessor function in `apps/api/src/db/geo.ts` — raw SQL is never written inline in service code.
- The PostGIS migration file (`migrations/{timestamp}_postgis/migration.sql`) is the single file that installs the extension, adds geography columns, and creates GIST indexes. It is **idempotent** (uses `CREATE EXTENSION IF NOT EXISTS`, `IF NOT EXISTS` for indexes where Postgres supports it, and `DO $$ ... $$ LANGUAGE plpgsql` blocks with existence checks otherwise).
- `prisma migrate deploy` applies the PostGIS migration in order with all other migrations. No special deploy step is required.
- The CI integration test suite asserts (a) all 17 GIST indexes from TRD §3.2 are present via `pg_indexes`, (b) `PostGIS_Version()` returns a version ≥ 3.4, and (c) a round-trip of a `LINESTRING` through a raw SQL insert and a `ST_NumPoints` query returns the expected point count.

### Developer experience

- Local development uses `postgis/postgis:16-3.4` via docker-compose (T0.06). Developers do not need a local PostGIS install.
- `psql -c 'SELECT PostGIS_Version();'` against the compose stack is the verification step any developer can run to confirm their environment matches production.
- Prisma Studio works for all non-geography columns. Geography columns are inspected via `psql` or the `ST_AsGeoJSON` helper in `apps/api/src/db/geo.ts`.

### Future extensibility

- The raw-DDL boundary does not prevent adding more geography columns or indexes — they go into a new migration file following the same naming convention.
- Upgrading PostGIS does not require Prisma changes — only the extension version in the migration and in the docker-compose image changes.
- If a future requirement needs `ST_MakeValid`, `ST_Buffer`, or any other PostGIS function, it is added to `apps/api/src/db/geo.ts` and the boundary rule keeps it isolated from Prisma-generated code.

---

## References

- `tasks/plan.md` §2, T-02 — Decision recorded as made 2026-08-23
- `tasks/plan.md` §4, ADR-002 — Architecture decision table entry
- `tasks/plan.md` §11 — Risk: "PostGIS + Prisma friction (no native geography type)" and its mitigation
- TRD §2.2 — ORM: Prisma 5
- TRD §3.1 — Schema: geography column definitions
- TRD §3.2 — Indexes: 17 named indexes including GIST indexes on geography columns
- TRD §4.1 Step 1 — Candidate query using `ST_DWithin` as the hot path
- TRD §11.1 — Infrastructure: RDS PostgreSQL 16 in VPC with Terraform
- `ADR-009` — `driver_schedule_slots` is a derived conflict-detection cache (companion decision)
- Amazon RDS for PostgreSQL — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html
- PostGIS 3.4 documentation — https://postgis.net/docs/manual-3.4/
- Prisma `Unsupported` types — https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#unsupported

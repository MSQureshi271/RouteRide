# SPEC: platform-foundation

> **Module ID:** `platform-foundation`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`platform-foundation`)

---

## 1. Objective

Provide the foundational monorepo infrastructure, environment configuration, database schema, Prisma migrations, shared contracts, quality-gate CI pipeline, Docker local development environment, and observability baseline (structured logging, distributed tracing, metrics, error handling) across all RouteRide microservices and applications.

### User Personas
- **Developer / AI Agent:** Needs fast local iteration, strict contracts, reproducible environments, deterministic seed fixtures, and immediate validation feedback.
- **Operator / SRE:** Needs visibility into service health, RED metrics, centralized structured logs with PII redaction, and automated deployment/rollback gates.

---

## 2. Commands

Full executable commands for the foundation module:

```bash
# Monorepo full verification
pnpm install --frozen-lockfile
pnpm turbo lint
pnpm turbo typecheck
pnpm turbo test
pnpm turbo test:integration
pnpm turbo build

# Docker stacks
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.dev.yml down

# Database migrations & seeds (apps/api)
pnpm --filter api exec prisma migrate dev
pnpm --filter api exec prisma migrate deploy
pnpm --filter api seed
pnpm --filter api exec prisma studio

# Packages
pnpm --filter config build
pnpm --filter contracts build
pnpm --filter contracts test
```

---

## 3. Project Structure

```
d:/RouteRide/
├── .github/workflows/
│   ├── ci.yml                 # Quality-gate CI pipeline
│   ├── deploy.yml             # Staging & production deployment
│   └── rollback.yml           # Automated rollback workflow
├── docker-compose.dev.yml     # Local dev infrastructure (PostGIS, Redis, LocalStack, Mailhog)
├── docker-compose.test.yml    # Ephemeral test infrastructure
├── pnpm-workspace.yaml        # Workspace configuration
├── turbo.json                 # Turborepo task pipeline
├── tsconfig.base.json         # Base TypeScript configuration
├── packages/
│   ├── config/                # Environment validation, Pino logger, OTel tracer
│   │   ├── src/
│   │   │   ├── env.ts         # Zod env loader (loadEnv/getEnv)
│   │   │   ├── logger.ts      # Pino structured logger with redaction
│   │   │   └── tracing.ts     # OpenTelemetry SDK initialization
│   ├── contracts/             # Shared Zod schemas, DTOs, OpenAPI spec
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── common/        # Envelopes, pagination, error schemas
│   │   │   └── modules/       # Module-specific DTO schemas
│   └── ui/                    # Shared React Native component design tokens
└── apps/
    └── api/prisma/
        ├── schema.prisma      # Prisma schema v1
        ├── migrations/        # Raw SQL & DDL migrations (PostGIS)
        └── seed.ts            # Deterministic fixtures
```

---

## 4. Code Style & Rules

- **TypeScript:** Strict mode enabled. No `any` without documented reason.
- **Validation:** Zod schemas at all external boundaries. All schemas `.strict()`.
- **Money:** Stored as integer paisas/cents (`INTEGER`). No floats.
- **Timestamps:** UTC `TIMESTAMPTZ`. Schedules stored as `TIME` with explicit city timezone.
- **Logs:** Pino JSON structured logs with `requestId`. Coordinates rounded to 2 decimal places. No PII or raw secrets.

---

## 5. Testing Strategy

- **Unit Tests:** `packages/config` env loader tests, logger redaction tests, `packages/contracts` schema validation tests.
- **Integration Tests:** `apps/api` schema migration tests against real PostGIS container, index existence verification, raw SQL ST_DWithin tests.
- **Coverage Gate:** 90% line / 85% branch for `packages/config`, 85% line / 80% branch for `packages/contracts`.

---

## 6. Boundaries & Non-Goals

### In Scope
- Core mono-repo setup, Husky hooks, Commitlint, CI/CD pipeline.
- PostgreSQL 16 + PostGIS 3.4 database schema and migrations.
- Redis 7 pub/sub and BullMQ queue scaffolding.
- Zod environment loader and structured logging baseline.

### Non-Goals (Out of Scope)
- Business logic for matching, payments, or identity (delegated to downstream modules).
- Firebase Realtime Database (dropped in ADR-008).
- Multi-region DB replication (single region `ap-south-1` for MVP).

---

## 7. Success Criteria

1. `pnpm turbo lint typecheck test build` passes from a clean clone with zero warnings.
2. `docker compose -f docker-compose.dev.yml up -d` starts healthy PostGIS, Redis, LocalStack, and Mailhog instances.
3. Attempting to start API without `DATABASE_URL` halts immediately with explicit error naming the missing key.
4. Database migrations apply cleanly from empty and generate all 17 indexes from TRD §3.2.
5. All 7 `.agents/references/` files resolve properly.

---

## 8. Open Questions & Known Gaps

- *Resolved:* ADR-002 locks PostGIS 3.4 raw SQL migration boundary.
- *Resolved:* ADR-008 drops Firebase Realtime Database.
- *Resolved:* B6/B7 locks Karachi, Pakistan launch parameters in `docs/platform-parameters.md`.

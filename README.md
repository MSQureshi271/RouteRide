# RouteRide — Shared Van & Carpool Platform for School & Work

RouteRide is a route-matching and recurring subscription marketplace designed for daily school runs and work commutes. It features spatial corridor search with PostGIS, multi-party billing, real-time vehicle telemetry, and separate mobile experiences for drivers and parents.

---

## Architecture Overview

```
                           ┌────────────────────────────────────────┐
                           │      AWS Application Load Balancer      │
                           │         + AWS WAF v2 Managed Rules     │
                           └───────────────────┬────────────────────┘
                                               │
                        ┌──────────────────────┴──────────────────────┐
                        ▼                                             ▼
         ┌─────────────────────────────┐               ┌─────────────────────────────┐
         │     apps/api (NestJS/Fastify)│               │    apps/admin (Next.js 15)  │
         │  - REST & WebSocket Server  │               │  - Operations Dashboard     │
         │  - Port 3000                │               │  - Port 3001                │
         └──────────────┬──────────────┘               └─────────────────────────────┘
                        │
         ┌──────────────┼──────────────────────────────┐
         ▼              ▼                              ▼
┌─────────────────┐ ┌────────────────────────┐ ┌─────────────────────────────┐
│  apps/matching  │ │ PostgreSQL 16 + PostGIS│ │    ElastiCache Redis 7      │
│ (Python/FastAPI)│ │ - Spatial Corridor H3  │ │ - Rate Limiting (Token Bkt) │
│ - OR-Tools TSP  │ │ - Prisma 8 Pure Client │ │ - Socket.IO Pub/Sub Mesh    │
│ - Port 8000     │ │ - 17 Named / GIST Idxs │ │ - Session Token Storage     │
└─────────────────┘ └────────────────────────┘ └─────────────────────────────┘
```

### Architecture Decision Records (ADRs)

All major architectural choices are recorded under [`docs/decisions/`](docs/decisions/):

- **[ADR-001](docs/decisions/ADR-001-mobile-app-topology.md)**: Two mobile bundles from one Expo monorepo.
- **[ADR-002](docs/decisions/ADR-002-postgres-and-postgis.md)**: PostgreSQL 16 + PostGIS 3.4 on RDS with Prisma 8.
- **[ADR-003](docs/decisions/ADR-003-matching-service-runtime.md)**: Route matching in Python FastAPI with Shapely & OR-Tools.
- **[ADR-004](docs/decisions/ADR-004-realtime-transport.md)**: Socket.IO + Redis pub/sub for realtime vehicle tracking.
- **[ADR-005](docs/decisions/ADR-005-contracts-package-and-monorepo.md)**: pnpm workspaces monorepo with contract-first Zod schemas.
- **[ADR-006](docs/decisions/ADR-006-stripe-payment-intents-manual-capture.md)**: Stripe PaymentIntents with platform-driven billing orchestration.
- **[ADR-007](docs/decisions/ADR-007-monetary-and-temporal-types.md)**: Integer cents for currency and UTC `TIMESTAMPTZ` for timestamps.
- **[ADR-008](docs/decisions/ADR-008-drop-firebase-rtdb.md)**: Elimination of Firebase RTDB in favor of unified Socket.IO + Redis.
- **[ADR-009](docs/decisions/ADR-009-driver-schedule-slots-derived-cache.md)**: `driver_schedule_slots` as a derived transactional cache.
- **[ADR-010](docs/decisions/ADR-010-location-retention-and-privacy.md)**: 30-day hard retention purge and privacy posture for minor location data.

---

## Monorepo Layout

```
├── apps/
│   ├── api/              # NestJS + Fastify REST & WebSocket backend
│   ├── matching/         # Python FastAPI corridor search & route optimization engine
│   ├── admin/            # Next.js 15 operations & driver verification dashboard
│   ├── mobile-consumer/  # React Native / Expo app for parents and riders
│   └── mobile-driver/    # React Native / Expo app for verified drivers
├── packages/
│   ├── contracts/        # Contract-first Zod schemas, TypeScript types, and OpenAPI 3.1
│   ├── config/           # Zod-validated environment config, Pino logging, and OTel tracing
│   └── ui/               # Shared design system and React Native component tokens
├── infra/
│   ├── terraform/        # AWS Infrastructure as Code (VPC, RDS, Redis, S3, ALB, WAF)
│   └── ecs/              # ECS task definition templates for staging & production
└── docs/                 # Specifications, data privacy register, threat model, and ADRs
```

---

## Quick Start Guide

### Prerequisites

- **Node.js**: `v22.x` (LTS)
- **pnpm**: `v9.x` (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker & Docker Compose**: For local PostgreSQL 16 + PostGIS and Redis
- **Python**: `3.12+` (for `apps/matching`)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/MSQureshi271/RouteRide.git
cd RouteRide
pnpm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

_(Fill in local development secrets if needed. The default values work out-of-the-box with Docker Compose)._

### 3. Start Local Infrastructure Stack

Start PostgreSQL 16 with PostGIS 3.4, Redis 7, LocalStack (S3), and MailHog:

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 4. Compile Database Contracts & Seed Fixtures

```bash
# Compile Prisma 8 contract and type definitions
pnpm --filter @routeride/api prisma:emit

# Seed deterministic test fixtures (15 drivers with polylines, 8 consumers, 14 riders)
pnpm --filter @routeride/api seed
```

### 5. Start Development Servers

```bash
# Start backend API (http://localhost:3000)
pnpm --filter @routeride/api dev

# In a separate terminal, start Python matching service (http://localhost:8000)
cd apps/matching
uvicorn app.main:app --reload --port 8000
```

---

## Canonical Workspace Commands

All root commands are driven through Turborepo and pnpm workspaces:

| Command                                    | Description                                                          |
| :----------------------------------------- | :------------------------------------------------------------------- |
| `pnpm lint`                                | Run ESLint and Prettier across all TypeScript packages and apps      |
| `pnpm typecheck`                           | Run `tsc --noEmit` across all workspaces with zero type errors       |
| `pnpm test`                                | Run all unit test suites with Jest and pytest                        |
| `pnpm test:integration`                    | Run integration test suites against local PostgreSQL/Redis           |
| `pnpm build`                               | Compile all production bundles (`apps/api/dist`, Next.js standalone) |
| `pnpm --filter @routeride/api prisma:emit` | Recompile Prisma 8 PSL contract into TypeScript types                |
| `pnpm --filter @routeride/api seed`        | Populate database with deterministic geographic test data            |

---

## CI/CD and Delivery

- **Continuous Integration (`.github/workflows/ci.yml`)**: Enforces linting, type checks, unit tests, integration tests against PostGIS, dependency security audits, and code coverage gates on every Pull Request.
- **Continuous Deployment (`.github/workflows/deploy.yml`)**: Builds multi-stage Docker images on merge to `main`, updates Staging ECS Fargate services, runs automated smoke tests, and deploys to Production upon manual GitHub Environment approval.
- **Emergency Rollback (`.github/workflows/rollback.yml`)**: Dispatches one-click service rollbacks to previous image SHAs per [`docs/runbooks/rollback.md`](docs/runbooks/rollback.md).

---

## License

Private & Confidential. All Rights Reserved.

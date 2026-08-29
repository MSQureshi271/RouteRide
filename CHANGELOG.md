# Changelog

All notable changes to the RouteRide platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Phase 0 — Platform Foundation**:
  - **Infrastructure as Code (`infra/terraform/`)**: Full staging environment provisioning including VPC with public/private subnets, RDS PostgreSQL 16 Multi-AZ with PostGIS, ElastiCache Redis 7, private S3 documents bucket with SSE-KMS and versioning, assets bucket with CloudFront OAC, ECR repositories with scan-on-push, ALB with AWS WAF v2 managed rules, and least-privilege ECS IAM roles.
  - **Hardened Multi-Stage Containerization (`apps/*/Dockerfile`)**:
    - `apps/api/Dockerfile`: Lean Node 22 Alpine multi-stage build running as non-root `node` (UID 1000) with `/health` check probe.
    - `apps/matching/Dockerfile`: Python 3.12 slim multi-stage build running as non-root `appuser` (UID 10001) with `/health` check probe.
    - `apps/admin/Dockerfile`: Next.js standalone container running as non-root `nextjs` (UID 1001) with `/api/health` probe.
    - `.dockerignore`: Root file excluding secrets, logs, tests, coverage, and build caches.
  - **Continuous Delivery Pipeline (`.github/workflows/`)**:
    - `deploy.yml`: Automated ECR build & push, staging ECS deployment with stability checks, smoke test verification, and gated production deployment with manual approval and automated database migration execution.
    - `smoke.yml`: Reusable smoke test suite verifying `/health`, `/metrics`, security headers, and request ID error envelopes.
    - `rollback.yml`: Emergency `workflow_dispatch` rollback action.
  - **Runbooks & Documentation**:
    - `docs/runbooks/rollback.md`: Standard operating procedure covering 3-tier recovery (feature flags, ECS image rollback, database migration resolution).
    - `README.md`: Comprehensive quickstart, architecture map, command table, and environment guides.
  - **Architecture Decision Records (`docs/decisions/`)**:
    - `ADR-001`: Two mobile bundles from one Expo monorepo.
    - `ADR-002`: PostgreSQL 16 + PostGIS 3.4 on RDS with Prisma 8 ORM.
    - `ADR-003`: Route-matching as a separate Python FastAPI microservice.
    - `ADR-004`: Socket.IO + Redis Pub/Sub for realtime transport.
    - `ADR-005`: Monorepo architecture with shared contracts package (`packages/contracts`).
    - `ADR-006`: Stripe PaymentIntents with platform-driven billing orchestration.
    - `ADR-007`: Monetary (integer cents) and temporal (`TIMESTAMPTZ` UTC) data types.
    - `ADR-008`: Elimination of Firebase Realtime Database in favor of Socket.IO + Redis.
    - `ADR-009`: `driver_schedule_slots` as a derived conflict-detection cache.
    - `ADR-010`: 30-day location telemetry retention and privacy posture.
  - **Database & Prisma 8 Setup**:
    - Pure Prisma 8 ORM (`8.0.0-rc.12`) with `@prisma/orm-postgres` and `@prisma/orm-extension-postgis` (`8.0.0-rc.8`).
    - 16 core PostgreSQL tables with 10 enums and all 17 named indexes (including 3 GIST spatial indexes).
    - Deterministic seed fixtures generating 15 drivers, 8 consumers, 14 riders, and active subscriptions with real geographic polylines.
  - **Data Contracts & OpenAPI (`packages/contracts`)**:
    - Zod schemas and inferred types for all TRD §5 DTOs.
    - OpenAPI 3.1 schema specification (`openapi.json`).
  - **Security & Observability Scaffolding (`packages/config`, `apps/api`)**:
    - Pino JSON structured logging with automatic password/secret redaction and 2-decimal-place coordinate truncation.
    - Prometheus RED metrics histograms (`http_request_duration`, `db_operation_duration`, `external_dep_duration`).
    - Terminus health check endpoint (`GET /health`) with live DB and Redis connection probes.
    - Redis-backed rate limiting across auth, OTP, search, and general tiers.
    - Global Fastify security headers with Helmet.

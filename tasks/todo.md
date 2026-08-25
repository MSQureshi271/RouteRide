# RouteRide MVP — Task List

Companion to `tasks/plan.md`. **Do not start `T0.*` until Gate D closes and the plan is approved.**

**Legend** — Size: `XS` 1 file · `S` 1–2 · `M` 3–5. Nothing larger is allowed; an `L` task is a
planning bug and must be split. Every task inherits the project-wide Definition of Done in
`tasks/plan.md` §5 on top of its own acceptance criteria.

**Repository commands** are not yet established (no code exists). `T0.04` fixes them, and every
`Verify` line below that references `pnpm …` is authoritative only once `T0.04` lands. Until then,
do not assume a default command.

---

## Gate D — Decisions and Guardrails (1 week, before any code)

- [x] **T-D.01 — ADR-001: mobile app topology** · `S` · deps: —
  - **Do:** **Decided 2026-08-23: two bundles from one monorepo** (`apps/mobile-consumer`, `apps/mobile-driver`, shared `packages/ui`). Write the ADR recording it, with the alternative (single binary with role switching) and its consequences.
  - **Accept:** Decision recorded with store-listing, OTA, bundle-size, and permission-scope consequences; the driver-only background-location permission set is named as the deciding factor; both scaffolds named.
  - **Verify:** ADR reviewed and marked Accepted by the mobile lead; `docs/decisions/ADR-001-*.md` committed.
  - **Files:** `docs/decisions/ADR-001-mobile-app-topology.md`
  - **Skills:** documentation-and-adrs
- [x] **T-D.02 — ADR-002: PostgreSQL hosting and PostGIS access strategy** · `S` · deps: —
  - **Do:** Resolve RDS vs Supabase (T-02) and how Prisma reaches `GEOGRAPHY` columns (raw SQL boundary).
  - **Accept:** Host chosen; the raw-DDL boundary is stated as a rule ("geography and GIST only in `prisma/migrations/*_postgis.sql`"); backup and Multi-AZ posture named.
  - **Verify:** ADR Accepted; a throwaway `ST_DWithin` query runs against the chosen host from a local client.
  - **Files:** `docs/decisions/ADR-002-postgres-and-postgis.md`
  - **Skills:** documentation-and-adrs, source-driven-development
- [x] **T-D.03 — ADR-003: route-matching service runtime** · `S` · deps: —
  - **Do:** Confirm Python/FastAPI vs Node/turf.js (T-03), including the polyglot CI and deploy cost.
  - **Accept:** Decision plus the operational consequences it creates (second toolchain in CI, second base image, second coverage config).
  - **Verify:** ADR Accepted; OR-Tools installs on the chosen base image in a scratch container.
  - **Files:** `docs/decisions/ADR-003-matching-service-runtime.md`
  - **Skills:** documentation-and-adrs, source-driven-development
- [x] **T-D.04 — ADR-004: realtime transport** · `S` · deps: —
  - **Do:** Confirm Socket.IO + Redis adapter vs API Gateway WebSocket (T-04). Note the sticky-session requirement for drivers.
  - **Accept:** Transport chosen; connection-duration, payload-size, and auth-on-upgrade constraints documented.
  - **Verify:** ADR Accepted; a two-node local Socket.IO + Redis fan-out spike delivers one publish to a client on the other node.
  - **Files:** `docs/decisions/ADR-004-realtime-transport.md`
  - **Skills:** documentation-and-adrs, doubt-driven-development

- [x] **T-D.05 — Record the resolved scope conflicts and close B4** · `S` · deps: —
  - **Do:** Three of the four are decided (2026-08-23): **B1** `ROUND_TRIP` direction is evaluated per leg; **B2** SOS is out of MVP per PRD §15.2; **B3** payouts settle on payments collected per TRD §10.4. Write them into the spec-delta document with their consequences. **B4 remains open** — pick plain interval overlap (TRD §4.1) or PRD §7.3's looser "could not both be served" rule, and restate the match-success KPI to match whichever is chosen.
  - **Accept:** All four recorded with rationale and the affected PRD/TRD sections cited; the delta explicitly notes that PRD §18 can no longer cite SOS or escrow as mitigations, and names the refund path and 3-strike counters as their replacements; the realistic match-success target is restated under the B4 choice.
  - **Verify:** Product and backend leads both sign off; `docs/SPEC-DELTA-mvp.md` committed and linked from every affected module spec.
  - **Files:** `docs/SPEC-DELTA-mvp.md`
  - **Skills:** spec-driven-development, using-agent-skills
- [x] **T-D.06 — Commercial and configuration parameters** · `S` · deps: —
  - **Do:** Fix launch market and currency (Q1), driver price min/max (Q5), commitment and cancellation terms (Q6), commission rate, background-check policy (Q7), and whether scoring weights are configurable (T-10).
  - **Accept:** Every value expressed as a named environment variable or DB-configurable row, not a literal; defaults recorded.
  - **Verify:** The list maps 1:1 onto entries in the `.env.example` drafted in `T0.07`.
  - **Files:** `docs/platform-parameters.md`
  - **Skills:** api-and-interface-design
- [x] **T-D.07 — Legal and regulatory review for the launch city** · `S` · deps: —
  - **Do:** Confirm the transport-of-minors regime (Q8), operator-licensing exposure, and the marketplace-vs-carrier liability posture. Confirm the applicable privacy regime.
  - **Accept:** A written go/no-go per market with any product constraints it imposes (e.g. mandatory driver checks, female-driver filter demand per Q9).
  - **Verify:** Signed off by whoever owns legal risk; constraints appear as acceptance criteria on the affected tasks.
  - **Files:** `docs/regulatory-review.md`
  - **Skills:** security-and-hardening
- [x] **T-D.08 — Personal-data classification and retention register** · `M` · deps: T-D.07
  - **Do:** Classify every field in the TRD schema as non-personal / personal / sensitive. Children's names, photos, home addresses, and live location are sensitive. Set a retention period and a deletion mechanism per store, including S3, Redis, logs, backups, and any analytics copy.
  - **Accept:** Every personal field has a stated purpose, a retention period, and a named deletion path; no field is collected without a purpose; the register drives `T1.61`.
  - **Verify:** Walk the register against the migration-v1 schema field by field — zero unclassified columns.
  - **Files:** `docs/data-privacy-register.md`
  - **Skills:** security-and-hardening
- [x] **T-D.09 — STRIDE threat model per trust boundary** · `M` · deps: T-D.08
  - **Do:** Enumerate trust boundaries (mobile→API, driver→WS, Stripe webhook, S3 upload, admin API, matching service, FCM) and run STRIDE over each. Write an abuse case beside every use case.
  - **Accept:** Each boundary has named assets, threats, and mitigations; every abuse case maps to a specific test task in this list.
  - **Verify:** Every "Never Do" item in `security-and-hardening` has a corresponding control assigned to a task.
  - **Files:** `docs/threat-model.md`
  - **Skills:** security-and-hardening, doubt-driven-development

### ✅ Checkpoint D — decisions locked
- [x] ADR-001 … ADR-004 Accepted; B4, B6, and B7 answered (B1, B2, B3, B5 decided 2026-08-23; B4, B6, B7 decided 2026-08-25)
- [x] Spec-delta, parameters, regulatory review, privacy register, and threat model committed
- [x] PRD §18 risk table updated in SPEC-DELTA to stop citing SOS and escrow as mitigations
- [x] `tasks/plan.md` updated to reflect all decisions and locked parameters
- [x] Human approval to begin Phase 0 received

---

## Phase 0 — Foundation (realistic: 6–7 weeks)

### 0.1 Repository, rules, and CI (`platform-foundation`)

- [ ] **T0.01 — Initialise the git repository and commit hygiene** · `S` · deps: Checkpoint D
  - **Do:** `git init`, first commit, `main` as default. Add `.gitignore` covering `node_modules/`, `dist/`, `.next/`, `.env*` (except `.env.example`), `*.pem`, `*.key`, `__pycache__/`, `.venv/`. Install husky + lint-staged + commitlint (conventional commits).
  - **Accept:** A commit touching `.env` is impossible; a non-conventional commit message is rejected; branch protection on `main` requires status checks and forbids force-push.
  - **Verify:** Attempt to commit a file containing `STRIPE_SECRET_KEY=sk_live_x` — hook blocks it. Attempt `git commit -m "wip"` — commitlint rejects it.
  - **Files:** `.gitignore`, `.husky/*`, `commitlint.config.cjs`, `package.json`
  - **Skills:** git-workflow-and-versioning, security-and-hardening
- [ ] **T0.02 — Author the seven missing `.agents/references/` files** · `M` · deps: T0.01
  - **Do:** Create `definition-of-done.md` (verbatim from `plan.md` §5), `security-checklist.md`, `performance-checklist.md`, `accessibility-checklist.md`, `observability-checklist.md`, `testing-patterns.md`, `orchestration-patterns.md`. Every skill's `See Also` currently points at a missing file.
  - **Accept:** All seven exist; each contains the checklist its citing skill promises, not a stub; the DoD matches `plan.md` §5 exactly.
  - **Verify:** `grep -roh '\.\./\.\./references/[a-z-]*\.md' .agents/skills | sort -u` — every path resolves to an existing file.
  - **Files:** `.agents/references/*.md` (7 files)
  - **Skills:** documentation-and-adrs, using-agent-skills
- [ ] **T0.03 — Author `CLAUDE.md` and the project map** · `S` · deps: T0.04
  - **Do:** Write the rules file: tech stack with versions, full commands, code conventions with one real example snippet, and Always/Ask-first/Never boundaries. Add a hierarchical project map so future sessions load one module's context rather than the whole spec.
  - **Accept:** Covers stack, commands, conventions, boundaries; boundaries include "ask before schema changes", "never commit secrets", "never add a dependency without a bundle/audit check".
  - **Verify:** Every command in the file runs successfully from a clean clone.
  - **Files:** `CLAUDE.md`, `docs/project-map.md`
  - **Skills:** context-engineering
- [ ] **T0.04 — Monorepo scaffold and canonical commands** · `M` · deps: T0.01, T-D.01, T-D.03
  - **Do:** pnpm workspaces + Turborepo. Create `apps/api`, `apps/matching`, `apps/admin`, `apps/mobile-consumer`, `apps/mobile-driver`, `packages/contracts`, `packages/ui`, `packages/config`. Pin the package manager in `packageManager`. Set root scripts: `lint`, `typecheck`, `test`, `test:integration`, `build`.
  - **Accept:** One lockfile at the workspace root; `pnpm -w lint typecheck test build` succeeds on the empty scaffold; Python app has its own `pyproject.toml` + pinned toolchain.
  - **Verify:** `pnpm install --frozen-lockfile` from a clean checkout, then `pnpm -w build`.
  - **Files:** `pnpm-workspace.yaml`, `turbo.json`, `package.json`, `apps/*/package.json`
  - **Skills:** api-and-interface-design, ci-cd-and-automation
- [ ] **T0.05 — Write one `SPEC-<module>.md` per capability-map module** · `M` · deps: Checkpoint D
  - **Do:** Fourteen specs, one per module id, each covering all six core areas: objective, commands, structure, code style, testing strategy, boundaries — plus success criteria and open questions.
  - **Accept:** Every spec traces to a module id in the approved map; no spec covers two modules; success criteria are testable conditions, not adjectives.
  - **Verify:** Reviewed and approved module by module before that module's first implementation task starts.
  - **Files:** `docs/SPEC-<module-id>.md` (14 files)
  - **Skills:** spec-driven-development

- [ ] **T0.06 — Local development stack via docker-compose** · `S` · deps: T0.04
  - **Do:** `docker-compose.dev.yml` with `postgis/postgis:16-3.4`, `redis:7`, LocalStack (S3), and Mailhog. Add a `docker-compose.test.yml` variant with ephemeral volumes for CI-equivalent local runs.
  - **Accept:** `docker compose -f docker-compose.dev.yml up` yields a reachable DB with the PostGIS extension available, a reachable Redis 7, and an S3 endpoint.
  - **Verify:** `psql -c 'SELECT PostGIS_Version();'` and `redis-cli ping` both succeed against the compose stack.
  - **Files:** `docker-compose.dev.yml`, `docker-compose.test.yml`
  - **Skills:** ci-cd-and-automation
- [ ] **T0.07 — Zod-validated configuration loader and `.env.example`** · `S` · deps: T0.04, T-D.06
  - **Do:** `packages/config` exposes a parsed, typed config object. Validate every variable from TRD §20 at process start and exit non-zero on a missing or malformed required value. Commit `.env.example` with placeholders only.
  - **Accept:** Booting without `DATABASE_URL` fails immediately with a readable message naming the variable; `CORS_ALLOWED_ORIGINS` rejects `*` when `NODE_ENV=production`; no real value appears in `.env.example`.
  - **Verify:** Unit test per required variable asserting the boot failure; `grep -E 'sk_live|whsec_[A-Za-z0-9]{10}' .env.example` returns nothing.
  - **Files:** `packages/config/src/env.ts`, `packages/config/src/env.test.ts`, `.env.example`
  - **Skills:** security-and-hardening, api-and-interface-design
- [ ] **T0.08 — CI quality-gate pipeline** · `M` · deps: T0.04
  - **Do:** `.github/workflows/ci.yml` running lint → typecheck → unit tests → build → dependency audit as parallel jobs with dependency caching, plus a `pytest` + `ruff` + `mypy` job for the matching service. Path filters so a mobile-only change skips the Python job.
  - **Accept:** Runs on every PR and every push to `main`; a lint error, a type error, a failing test, or a high-severity advisory each fail the run; total wall time under 10 minutes.
  - **Verify:** Open a scratch PR that introduces one type error — the run fails at typecheck and merge is blocked.
  - **Files:** `.github/workflows/ci.yml`
  - **Skills:** ci-cd-and-automation
- [ ] **T0.09 — CI integration-test job with PostGIS** · `S` · deps: T0.08, T0.11
  - **Do:** Add a job with a `postgis/postgis:16-3.4` service container and a Redis service. Run `prisma migrate deploy`, then the API and matching integration suites. Credentials come from GitHub Secrets, never literals.
  - **Accept:** Migrations apply from empty on every run; integration tests run against a real database, not a mock; no credential appears in the workflow file.
  - **Verify:** The job passes on a PR containing a migration; deliberately break a migration and confirm the job fails.
  - **Files:** `.github/workflows/ci.yml`
  - **Skills:** ci-cd-and-automation, test-driven-development
- [ ] **T0.10 — Coverage thresholds enforced in CI** · `S` · deps: T0.08
  - **Do:** Configure Jest and pytest coverage gates per TRD §15.3 — API 80% line / 75% branch, matching 90/85, mobile 70/65 — and fail the build on a drop against changed files.
  - **Accept:** Merging code that lowers a module below its threshold is impossible; the report is uploaded as a CI artefact.
  - **Verify:** Add an untested exported function to `apps/api` and confirm the coverage gate fails the run.
  - **Files:** `jest.config.ts`, `apps/matching/pyproject.toml`, `.github/workflows/ci.yml`
  - **Skills:** ci-cd-and-automation, test-driven-development

### ✅ Checkpoint 0-A — the gates exist before the code does
- [ ] CI green on the empty scaffold; every gate demonstrably blocks a bad change
- [ ] All seven `.agents/references/` files exist and resolve
- [ ] `CLAUDE.md` commands all run from a clean clone
- [ ] Branch protection active on `main`

### 0.2 Schema, contracts, and the observability baseline (`platform-foundation`)

- [ ] **T0.11 — Prisma schema v1 plus the PostGIS raw-DDL migration** · `M` · deps: T0.06, T-D.02
  - **Do:** Translate TRD §3.1 into `schema.prisma` for everything Prisma can express. Put extensions (`uuid-ossp`, `postgis`), the ten enum types, all `GEOGRAPHY` columns, and the GIST indexes into one dedicated raw-SQL migration. Add the B-tree and partial indexes from TRD §3.2.
  - **Accept:** `prisma migrate deploy` builds the full schema from empty; every index in TRD §3.2 exists; every timestamp is `TIMESTAMPTZ`; every money column is `INTEGER` cents.
  - **Verify:** Integration test queries `pg_indexes` and asserts each of the 17 named indexes exists, and asserts `idx_dp_route` is `gist`; a second test round-trips a `LINESTRING` through Prisma raw SQL.
  - **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*_init/`, `apps/api/prisma/migrations/*_postgis/migration.sql`, `apps/api/test/schema.integration.test.ts`
  - **Skills:** api-and-interface-design, test-driven-development, source-driven-development
- [ ] **T0.12 — Migration v2: close the TRD schema gaps** · `M` · deps: T0.11
  - **Do:** Add the tables and columns TRD prose requires but its DDL omits (see `plan.md` §10.6–§10.10): `refresh_tokens`, `payment_methods`, `support_tickets`, `driver_profiles.acceptance_rate` and `typical_departure_time`, and a real foreign key on `trips.location_log_id`. Add a `pickup_order` uniqueness constraint per driver per leg.
  - **Accept:** Every field read by code specified in the TRD now exists; no column is added without a consumer; `refresh_tokens` stores only a SHA-256 hash.
  - **Verify:** Migration applies and rolls forward cleanly on a seeded database; a test asserts each new constraint rejects the value it is meant to reject.
  - **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*_schema_gaps/`, `apps/api/test/schema-v2.integration.test.ts`
  - **Skills:** api-and-interface-design, doubt-driven-development
- [ ] **T0.13 — Deterministic seed fixtures** · `S` · deps: T0.11
  - **Do:** A seed script producing a fixed, hand-checkable world: 12 approved drivers with real polylines across one city, 3 pending drivers, 8 consumers, 14 riders, and a mix of active, pending, and cancelled subscriptions. Fixed UUIDs and a fixed clock.
  - **Accept:** Running the seed twice from empty produces byte-identical rows; the polylines include at least one that intersects a pickup point at exactly the radius boundary and one that runs the opposite direction.
  - **Verify:** `pnpm --filter api seed` then a test asserting known row counts and one known `ST_DWithin` result.
  - **Files:** `apps/api/prisma/seed.ts`, `apps/api/prisma/fixtures/*.json`
  - **Skills:** test-driven-development
- [ ] **T0.14 — `packages/contracts`: the full DTO surface, contract-first** · `M` · deps: T0.04, T0.05
  - **Do:** Zod schemas plus inferred TypeScript types for every request and response in TRD §5, the response and error envelopes, the pagination shape, and the WebSocket event payloads from §6.2–§6.3. Generate the OpenAPI document from the same schemas. Publish the matching service's contract as generated Pydantic models or a shared JSON Schema.
  - **Accept:** Every endpoint has typed input and output; enums are `UPPER_SNAKE`; fields are `camelCase`; money is integer cents with a currency field; all schemas are `.strict()`. `POST /trips/sos`, the `trip:sos` event, and every `[PHASE 2]`-marked endpoint are **excluded** — B2 put SOS out of MVP, and an unused schema is a promise nobody kept.
  - **Verify:** `pnpm --filter contracts test` round-trips a valid and an invalid sample per schema; the generated OpenAPI document validates against the 3.1 meta-schema.
  - **Files:** `packages/contracts/src/**`, `packages/contracts/openapi.json`
  - **Skills:** api-and-interface-design, incremental-implementation
- [ ] **T0.15 — Response envelope, error contract, and `requestId`** · `S` · deps: T0.14
  - **Do:** NestJS global interceptor wrapping every success in `{ data, meta: { requestId, timestamp } }` and a global exception filter emitting `{ error: { code, message, details }, meta }`. Map the nine status codes from TRD §5.10. Never leak a stack trace or internal message.
  - **Accept:** A thrown internal error returns `500 INTERNAL_ERROR` with a `requestId` and nothing else; `X-Request-ID` is set on every response; every error code in §5.10 is reachable and tested.
  - **Verify:** Integration test per status code asserting the envelope shape; a test throwing a raw `Error` asserts no stack text appears in the body.
  - **Files:** `apps/api/src/common/response.interceptor.ts`, `apps/api/src/common/error.filter.ts`, `apps/api/test/error-contract.integration.test.ts`
  - **Skills:** api-and-interface-design, security-and-hardening

- [ ] **T0.16 — Structured logging with redaction** · `S` · deps: T0.15
  - **Do:** Pino in every Node service and structlog in the matching service. Child logger per request carrying `requestId` and `userId`. A redaction allowlist, and a coordinate formatter that rounds to 2 decimal places before any coordinate is logged. Never log whole request bodies.
  - **Accept:** Every line is JSON with `level`, `timestamp`, `service`, `requestId`, and a stable `event` name; passwords, tokens, OTPs, and card data cannot reach the output; coordinates in logs are 2dp.
  - **Verify:** A test posts a login with a known password and asserts the string is absent from captured log output; a test logs a location event and asserts `24.86` not `24.8607412`.
  - **Files:** `packages/config/src/logger.ts`, `apps/matching/app/logging.py`, `packages/config/src/logger.test.ts`
  - **Skills:** observability-and-instrumentation, security-and-hardening
- [ ] **T0.17 — OpenTelemetry tracing and Sentry across all services** · `S` · deps: T0.16
  - **Do:** OTel Node SDK with auto-instrumentation, imported before anything else; the Python equivalent in the matching service. Propagate W3C `traceparent` on every service-to-service call and into BullMQ job metadata. Initialise Sentry in API, workers, matching, and both mobile apps.
  - **Accept:** One request from the API through the matching service to the database appears as a single unbroken trace; `requestId` is queryable as a span attribute; queue jobs continue the parent trace.
  - **Verify:** Trigger a search against the local stack and follow the trace end to end with no orphan spans.
  - **Files:** `packages/config/src/tracing.ts`, `apps/matching/app/tracing.py`, `apps/api/src/main.ts`
  - **Skills:** observability-and-instrumentation
- [ ] **T0.18 — RED metrics and the health endpoint** · `S` · deps: T0.17
  - **Do:** Histogram-based request duration with `method`, `route` (template, never raw URL), and `status_class` labels; the same three RED signals around every external dependency (Postgres, Redis, Stripe, FCM, Maps, S3). `GET /health` returning `{ status, db, redis }` with real checks.
  - **Accept:** No metric label can take an unbounded value; latency is a histogram with p50/p95/p99 queryable; `/health` returns 503 when Postgres is unreachable.
  - **Verify:** A test asserts the label set of every registered metric is drawn from a fixed allowlist; stop the local database and confirm `/health` degrades rather than hanging.
  - **Files:** `apps/api/src/common/metrics.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/test/metrics.test.ts`
  - **Skills:** observability-and-instrumentation
- [ ] **T0.19 — Security headers, CORS, and Redis-backed rate limiting** · `S` · deps: T0.15
  - **Do:** `helmet` with the CSP, HSTS, referrer-policy, and frameguard settings from TRD §12.5. CORS from an explicit allowlist. A Redis-backed limiter implementing every row of TRD §12.4 — 5/IP/10min on auth, 3/phone/5min on OTP, 30/user/min on search, 200/user/min general.
  - **Accept:** `*` is rejected as a CORS origin when `NODE_ENV=production`; exceeding a limit returns `429` with `Retry-After`; limits are per the table, not one global number.
  - **Verify:** Integration test per limiter row driving the endpoint past its limit and asserting `429` plus the header; a test asserts the response carries HSTS and `X-Content-Type-Options`.
  - **Files:** `apps/api/src/main.ts`, `apps/api/src/common/rate-limit.ts`, `apps/api/test/rate-limit.integration.test.ts`
  - **Skills:** security-and-hardening

### ✅ Checkpoint 0-B — the platform is observable and safe by default
- [ ] Migrations apply from empty; all 17 indexes present and correctly typed
- [ ] `/health` returns 200 locally and 503 with the database stopped
- [ ] One request produces a structured log with `requestId` and an unbroken trace
- [ ] Every rate-limit row and every error code has a passing test
- [ ] `packages/contracts` covers the whole TRD §5 surface; OpenAPI generates

### 0.3 Infrastructure and delivery (`platform-foundation`)

- [ ] **T0.20 — Terraform: staging environment** · `M` · deps: T-D.02
  - **Do:** VPC with public and private subnets, RDS PostgreSQL 16 Multi-AZ (`db.t4g.micro` for staging), ElastiCache Redis 7, two S3 buckets (documents private with SSE-KMS and versioning, assets behind CloudFront), ECR repositories with scan-on-push, Secrets Manager entries, and an ALB with WAF managed rules. State in S3 with a DynamoDB lock.
  - **Accept:** `terraform plan` is clean and idempotent; the documents bucket denies non-HTTPS `PUT` and has no public access; ECS task roles are least-privilege with no instance-metadata access.
  - **Verify:** `terraform apply` in staging, then confirm from outside the VPC that the documents bucket and the admin ALB are both unreachable.
  - **Files:** `infra/terraform/{main,rds,redis,s3,ecr,alb,secrets}.tf`
  - **Skills:** security-and-hardening, ci-cd-and-automation
- [ ] **T0.21 — Hardened container images** · `S` · deps: T0.04
  - **Do:** Multi-stage Dockerfiles for `api`, `matching`, `admin`, and `worker`. Non-root user, `node:22-alpine` and a slim Python base, `HEALTHCHECK` hitting `/health`, no secrets baked in, `.dockerignore` excluding tests and `.env*`.
  - **Accept:** Every image runs as a non-root UID; `docker history` shows no secret; the images build reproducibly from a clean checkout.
  - **Verify:** `docker run --rm <image> id` prints a non-zero UID; ECR scan-on-push reports no CRITICAL finding.
  - **Files:** `apps/api/Dockerfile`, `apps/matching/Dockerfile`, `apps/admin/Dockerfile`, `.dockerignore`
  - **Skills:** security-and-hardening, ci-cd-and-automation
- [ ] **T0.22 — CD pipeline: build, staging, gated production** · `M` · deps: T0.08, T0.20, T0.21
  - **Do:** On merge to `main`: build and push images tagged with the git SHA, update the staging ECS task definitions, wait for service stability, run smoke tests against staging. A separate production job requiring GitHub environment approval, running `prisma migrate deploy` first, then a blue/green ECS deploy with automatic rollback on a failed health check inside 5 minutes.
  - **Accept:** No path exists from a red CI run to a production deploy; production requires a human approval; migrations run before the new task definition goes live.
  - **Verify:** Merge a trivial change and watch it reach staging automatically and stop at the production gate.
  - **Files:** `.github/workflows/deploy.yml`, `.github/workflows/smoke.yml`
  - **Skills:** ci-cd-and-automation, shipping-and-launch
- [ ] **T0.23 — Rollback workflow and runbook** · `S` · deps: T0.22
  - **Do:** A `workflow_dispatch` rollback that redeploys a named previous image digest, plus a written runbook covering feature-flag kill, image rollback, and migration rollback, with expected time-to-recover for each.
  - **Accept:** Rollback is executable by one person with no tribal knowledge; the runbook names the trigger thresholds from `shipping-and-launch`.
  - **Verify:** Deploy two versions to staging, then roll back to the first and confirm `/health` and a smoke test pass on the older image.
  - **Files:** `.github/workflows/rollback.yml`, `docs/runbooks/rollback.md`
  - **Skills:** shipping-and-launch, ci-cd-and-automation
- [ ] **T0.24 — README, changelog, and the foundation ADRs** · `S` · deps: T0.22
  - **Do:** README with quick start, the command table, and an architecture overview linking to the ADRs. Start `CHANGELOG.md` with `Keep a Changelog` grouping. Write ADR-005 through ADR-010 from `plan.md` §4, including ADR-008's removal of Firebase RTDB.
  - **Accept:** A new engineer can go from clone to a running local stack using only the README; all ten ADRs exist and are Accepted.
  - **Verify:** Hand the README to someone who has not seen the repo; they reach a running local stack without asking a question.
  - **Files:** `README.md`, `CHANGELOG.md`, `docs/decisions/ADR-00{5,6,7,8,9}-*.md`, `docs/decisions/ADR-010-*.md`
  - **Skills:** documentation-and-adrs

### ✅ Checkpoint 0-C — delivery works before there is anything to deliver
- [ ] Staging deploy succeeds from a merge to `main`; production gate holds
- [ ] Rollback dry-run verified on staging
- [ ] Documents bucket and admin ALB unreachable from the public internet
- [ ] README verified by someone who has not seen the repo

### 0.4 Identity (`identity`)

- [ ] **T0.25 — Registration with password hashing** · `S` · deps: T0.15, T0.19
  - **Do:** `POST /auth/register` accepting phone, full name, role, and password. bcrypt cost 12. Zod validation at the boundary (E.164 phone, password policy, role restricted to `CONSUMER` or `DRIVER`). Create the user as `PENDING_VERIFICATION`.
  - **Accept:** A caller cannot self-assign `ADMIN`, `INSTITUTION_ADMIN`, or `FLEET_ADMIN`; a duplicate phone returns `409`; the response never contains `passwordHash`; the endpoint is rate-limited 5/IP/10min.
  - **Verify:** Failing tests first for each of: weak password, malformed phone, privileged role, duplicate phone, response-field leakage.
  - **Files:** `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/test/auth-register.integration.test.ts`
  - **Skills:** test-driven-development, security-and-hardening, api-and-interface-design
- [ ] **T0.26 — Phone OTP issue and verify** · `S` · deps: T0.25
  - **Do:** Generate a single-use OTP, store it server-side in Redis with a 5-minute TTL, never return it in a response. Verify with a max of 3 attempts then a 15-minute lockout on that phone. Twilio adapter behind an interface, with a console adapter for local development.
  - **Accept:** The OTP never appears in any response or log; a fourth attempt is locked out even with the correct code; a verified user transitions to `ACTIVE`.
  - **Verify:** Tests for expiry, reuse, attempt exhaustion, lockout window, and the absence of the code from captured logs.
  - **Files:** `apps/api/src/auth/otp.service.ts`, `apps/api/src/notifications/sms.adapter.ts`, `apps/api/test/auth-otp.integration.test.ts`
  - **Skills:** security-and-hardening, test-driven-development
- [ ] **T0.27 — JWT access tokens and refresh-token rotation** · `M` · deps: T0.26, T0.12
  - **Do:** 15-minute HS256 access token carrying `sub`, `role`, `driverProfileId`, and `status`. Refresh token as an opaque 64-byte random string, stored only as a SHA-256 hash, rotated on every use with the previous token revoked. `POST /auth/login`, `/auth/refresh`, `/auth/logout`.
  - **Accept:** Replaying a used refresh token fails and revokes the whole chain; logout revokes; an expired access token returns `401 UNAUTHENTICATED`; no raw refresh token is ever persisted.
  - **Verify:** Tests for rotation, replay detection, revocation on logout, and expiry. A test asserts the stored value is a 64-hex-character digest and not the token.
  - **Files:** `apps/api/src/auth/token.service.ts`, `apps/api/src/auth/jwt.strategy.ts`, `apps/api/test/auth-tokens.integration.test.ts`
  - **Skills:** security-and-hardening, test-driven-development, doubt-driven-development
- [ ] **T0.28 — Google OAuth, exchanged server-side** · `S` · deps: T0.27
  - **Do:** `POST /auth/oauth/google` taking the authorization code, exchanging it server-side, validating the ID token signature against Google's JWKS with a cached key set, and upserting the user. The client never handles a Google access token.
  - **Accept:** A forged or expired ID token is rejected; a returning user is matched rather than duplicated; `isNewUser` is accurate; Google being unreachable returns `503` with a usable message.
  - **Verify:** Tests with a locally-signed valid token, a wrong-issuer token, an expired token, and a wrong-audience token.
  - **Files:** `apps/api/src/auth/google.service.ts`, `apps/api/test/auth-google.integration.test.ts`
  - **Skills:** security-and-hardening, source-driven-development
- [ ] **T0.29 — RBAC and ownership guards, with the matrix as tests** · `M` · deps: T0.27
  - **Do:** A role guard plus a resource-ownership guard. Encode every row of the TRD §8.2 RBAC matrix as a parameterised test across all four roles. Add the abuse cases from the threat model: credential stuffing, token replay, horizontal privilege escalation via another user's rider id, vertical escalation via a forged role claim.
  - **Accept:** Every cell of the matrix is asserted, allow and deny alike; a `CONSUMER` cannot read another consumer's rider; a `DRIVER` cannot mark a trip they do not own.
  - **Verify:** The matrix test suite passes with no `skip`; each abuse case has a failing-then-passing test.
  - **Files:** `apps/api/src/common/guards/roles.guard.ts`, `apps/api/src/common/guards/ownership.guard.ts`, `apps/api/test/rbac-matrix.integration.test.ts`, `apps/api/test/auth-abuse.integration.test.ts`
  - **Skills:** security-and-hardening, test-driven-development, doubt-driven-development
- [ ] **T0.30 — Password reset via OTP** · `S` · deps: T0.26, T0.27
  - **Do:** `POST /auth/forgot-password` and `/auth/reset-password`. Reuse the OTP service. Revoke every refresh token for the user on a successful reset.
  - **Accept:** The response to `forgot-password` is identical whether or not the phone exists (no account enumeration); a reset invalidates all existing sessions; the reset OTP expires.
  - **Verify:** Tests asserting identical responses and timing for existing and non-existent phones, and that a pre-reset refresh token stops working.
  - **Files:** `apps/api/src/auth/password-reset.service.ts`, `apps/api/test/auth-reset.integration.test.ts`
  - **Skills:** security-and-hardening, test-driven-development

### 0.5 Mobile shells and notification plumbing (`mobile-shell`, `notifications`)

- [ ] **T0.31 — Expo app scaffolds and the network layer** · `M` · deps: T0.14, T-D.01
  - **Do:** Two Expo SDK 53 apps sharing `packages/ui`. React Navigation 7 shells per role. Access token in memory in a Zustand store and never on disk; refresh token in `expo-secure-store`. Axios interceptors injecting the bearer token and performing a single-flight refresh on `401`. TanStack Query provider with sane defaults. `i18next` scaffolded with English only.
  - **Accept:** The access token is never written to disk; two concurrent `401`s trigger exactly one refresh; a failed refresh logs the user out cleanly rather than looping.
  - **Verify:** Unit test firing three parallel requests against a `401`-then-`200` mock server and asserting one refresh call; a test asserting `AsyncStorage` contains no token.
  - **Files:** `apps/mobile-*/app/_layout.tsx`, `packages/ui/src/api/client.ts`, `packages/ui/src/api/client.test.ts`, `packages/ui/src/store/auth.ts`
  - **Skills:** frontend-ui-engineering, source-driven-development, security-and-hardening
- [ ] **T0.32 — Design tokens and the core component library** · `M` · deps: T0.31
  - **Do:** A spacing scale, a semantic colour palette with verified contrast ratios, a type scale, and a corner-radius scale — then `Button`, `Input`, `Select`, `Card`, `Sheet`, `Badge`, `Skeleton`, `EmptyState`, `ErrorState`, `Toast`. No raw hex values and no off-scale spacing in any component.
  - **Accept:** Every interactive component is keyboard and screen-reader reachable with an accessible label; text contrast is at least 4.5:1 and large text 3:1; the palette is not the default purple/indigo AI aesthetic; no gradients or stacked shadows unless a token defines them.
  - **Verify:** A contrast test asserting every foreground/background token pair meets its ratio; render each component in a test and assert the accessibility role and label; visual check at 320px, 768px, 1024px, 1440px.
  - **Files:** `packages/ui/src/tokens.ts`, `packages/ui/src/components/**`, `packages/ui/src/tokens.test.ts`
  - **Skills:** frontend-ui-engineering
- [ ] **T0.33 — Auth screens for both apps** · `M` · deps: T0.32, T0.28
  - **Do:** Register, OTP entry, login, forgot/reset password, and Google sign-in. React Hook Form plus the Zod schemas from `packages/contracts` so client and server validate identically.
  - **Accept:** Every field error is announced and programmatically associated with its input; loading, error, and empty states exist on every screen; the OTP screen shows the remaining attempt count and the lockout state; no error message reveals whether an account exists.
  - **Verify:** Component tests for the validation, error, and loading states; tab through each screen and confirm focus order; a `401` from the server surfaces a readable message, not a raw envelope.
  - **Files:** `apps/mobile-*/app/(auth)/*.tsx`, `packages/ui/src/forms/*`, `apps/mobile-consumer/app/(auth)/login.test.tsx`
  - **Skills:** frontend-ui-engineering, test-driven-development
- [ ] **T0.34 — Detox harness and the first end-to-end flow** · `S` · deps: T0.33
  - **Do:** Configure Detox for iOS simulator and Android emulator. First flow: register → verify OTP → land in the correct role shell, for both apps.
  - **Accept:** The flow passes on both platforms against a seeded local backend; the run is repeatable without manual reset.
  - **Verify:** `npx detox test --configuration ios.sim.debug` and the Android equivalent both green; wired into CI as a nightly job, not a per-PR gate.
  - **Files:** `apps/mobile-*/e2e/register.e2e.ts`, `apps/mobile-*/.detoxrc.js`, `.github/workflows/e2e-nightly.yml`
  - **Skills:** test-driven-development, ci-cd-and-automation
- [ ] **T0.35 — Notification worker, adapters, and the in-app centre** · `M` · deps: T0.16, T0.12
  - **Do:** A BullMQ worker on Redis 7 streams. Adapters for FCM (`firebase-admin`), SendGrid, and Twilio behind one `NotificationChannel` interface. Persist every notification to `notifications` regardless of delivery outcome. Retry three times with 1s/10s/60s backoff. Deduplicate on SHA-256 of `(userId, type, entityId, date)` with a 1-hour Redis TTL. Drop and clear `fcm_token` on an `UNREGISTERED` response. Endpoints for listing and marking read, with the unread count cached for 10s.
  - **Accept:** The same logical notification enqueued twice within an hour sends once; a failing channel does not lose the in-app record; the type registry from TRD §9.2 is exhaustive and typed.
  - **Verify:** Tests for dedupe, retry-then-succeed, retry-exhausted, stale-token cleanup, and the in-app record surviving a channel failure.
  - **Files:** `apps/api/src/notifications/*.ts`, `apps/worker/src/notification.worker.ts`, `apps/api/test/notifications.integration.test.ts`
  - **Skills:** observability-and-instrumentation, test-driven-development, api-and-interface-design
- [ ] **T0.36 — FCM registration and handlers in both apps** · `S` · deps: T0.35, T0.31
  - **Do:** Request permission with a purpose string, register the token against the user, refresh it on rotation, and handle foreground, background, and cold-start-from-notification for every type in the registry. An in-app notification centre screen with read/unread state.
  - **Accept:** Tapping a notification deep-links to the right screen from all three app states; denying permission degrades gracefully rather than blocking the app; the token is cleared on logout.
  - **Verify:** Send one of each notification type to a device in all three states and confirm the destination; a test asserts logout clears the server-side token.
  - **Files:** `packages/ui/src/notifications/*`, `apps/mobile-*/app/(app)/notifications.tsx`
  - **Skills:** frontend-ui-engineering, source-driven-development

### 0.6 Driver onboarding and consumer profiles

- [ ] **T0.37 — Driver profile and vehicle onboarding** · `M` · deps: T0.29
  - **Do:** `POST /drivers/onboard` (personal and vehicle details), `GET /drivers/me`, and status gating that keeps a `PENDING` driver out of search results. Unique plate number enforced at the database level.
  - **Accept:** Seat capacity is bounded 1–50; vehicle year is sane; a duplicate plate returns `409`; a second onboarding attempt by the same user returns `409` rather than creating a second profile; the profile starts as `PENDING`.
  - **Verify:** Tests for each validation bound, the duplicate-plate conflict, the duplicate-profile conflict, and a `PENDING` driver's absence from a search once `T1.08` exists.
  - **Files:** `apps/api/src/drivers/drivers.controller.ts`, `apps/api/src/drivers/drivers.service.ts`, `apps/api/test/driver-onboard.integration.test.ts`
  - **Skills:** test-driven-development, api-and-interface-design
- [ ] **T0.38 — Document upload via pre-signed S3 URLs** · `M` · deps: T0.37, T0.20
  - **Do:** Issue a pre-signed `PUT` with a 5-minute TTL scoped to one key. Validate the declared MIME type and the actual magic bytes server-side on confirmation, cap the size, and record the document with an expiry date. Leave a hook for the ClamAV scan (the Lambda itself is Phase 2). Documents are served only through short-lived pre-signed `GET`s to admins.
  - **Accept:** Only `image/jpeg`, `image/png`, and `application/pdf` are accepted; a file whose magic bytes disagree with its declared type is rejected; the URL expires; no document is ever publicly readable.
  - **Verify:** Tests uploading a renamed executable, an oversized file, and an expired URL — all rejected. A test asserts the object ACL is private.
  - **Files:** `apps/api/src/drivers/documents.controller.ts`, `apps/api/src/storage/s3.service.ts`, `apps/api/test/documents.integration.test.ts`
  - **Skills:** security-and-hardening, test-driven-development
- [ ] **T0.39 — Route polyline definition and validation** · `M` · deps: T0.37, T0.11
  - **Do:** `PUT /drivers/me/route` accepting GeoJSON `LineString`. Validate coordinate ranges, a minimum point count, total length bounds, and that the whole line falls inside the launch city's bounding box. Store as `GEOGRAPHY(LINESTRING, 4326)`. Reject a self-intersecting or zero-length line.
  - **Accept:** Coordinates outside ±90/±180 are rejected; a two-identical-point line is rejected; a line outside the city bbox is rejected with a specific code; the stored SRID is 4326.
  - **Verify:** Property tests over generated coordinate sets; a round-trip test asserting `ST_NumPoints` and `ST_Length` match the input within tolerance.
  - **Files:** `apps/api/src/drivers/route.controller.ts`, `packages/contracts/src/geo.ts`, `apps/api/test/driver-route.integration.test.ts`
  - **Skills:** api-and-interface-design, test-driven-development, doubt-driven-development
- [ ] **T0.40 — Availability, pricing, and platform guardrails** · `S` · deps: T0.37, T-D.06
  - **Do:** `PATCH /drivers/me` for `operatingDays` (0–6, non-empty, unique) and `basePriceCents`, clamped to the platform min/max from configuration. Reject a price change while active subscriptions reference the old price without an explicit migration flag.
  - **Accept:** A price outside the range returns `422` naming the bounds; an empty or duplicated operating-days array is rejected; changing days that would orphan an active subscription is refused.
  - **Verify:** Tests at both price bounds, one outside each, and one attempting to drop an operating day still committed to an active subscription.
  - **Files:** `apps/api/src/drivers/drivers.controller.ts`, `apps/api/test/driver-pricing.integration.test.ts`
  - **Skills:** api-and-interface-design, test-driven-development
- [ ] **T0.41 — Consumer profile and emergency contact** · `S` · deps: T0.29
  - **Do:** `GET` and `PATCH /consumers/me` for the emergency contact name and phone. Create the consumer profile on first access.
  - **Accept:** The emergency phone is E.164-validated; the response excludes `stripeCustomerId`; a driver-role token is rejected with `403`.
  - **Verify:** Tests for validation, field exclusion, and the role rejection.
  - **Files:** `apps/api/src/consumers/consumers.controller.ts`, `apps/api/test/consumer-profile.integration.test.ts`
  - **Skills:** test-driven-development, security-and-hardening
- [ ] **T0.42 — Rider CRUD with geocoding** · `M` · deps: T0.41, T-D.08
  - **Do:** Create, list, update, and delete riders. Geocode home and destination addresses to `GEOGRAPHY(POINT)` via the Maps adapter, storing both the display text and the point. Block deletion when an active subscription exists. Treat the Maps response as untrusted and validate its shape before use.
  - **Accept:** A rider belongs to exactly one consumer and is invisible to every other consumer; deleting a rider with an active subscription returns `409`; an unresolvable address returns `422 NO_ROUTE_FOUND`; the Maps adapter failing returns `503`, never a partial record.
  - **Verify:** Tests for cross-consumer access, the delete conflict, geocode failure, and a malformed Maps response being rejected rather than stored.
  - **Files:** `apps/api/src/riders/riders.controller.ts`, `apps/api/src/maps/geocode.service.ts`, `apps/api/test/riders.integration.test.ts`
  - **Skills:** api-and-interface-design, security-and-hardening, test-driven-development

- [ ] **T0.43 — Driver onboarding wizard (mobile)** · `M` · deps: T0.37, T0.38, T0.39, T0.40, T0.32
  - **Do:** A four-step wizard — personal and vehicle, documents, route drawing on `react-native-maps`, availability and pricing — with resumable progress and a "pending verification" state screen.
  - **Accept:** Progress survives an app kill; every step has loading, error, and empty states; the route step shows the drawn line and rejects an invalid one with a specific message; the pending screen explains what happens next and how long it takes.
  - **Verify:** Component tests per step; a Detox flow completing the whole wizard and landing on the pending screen; tab and screen-reader pass on each step.
  - **Files:** `apps/mobile-driver/app/(onboarding)/*.tsx`, `packages/ui/src/maps/RouteDrawer.tsx`
  - **Skills:** frontend-ui-engineering, source-driven-development
- [ ] **T0.44 — Consumer profile and rider management (mobile)** · `M` · deps: T0.41, T0.42, T0.32
  - **Do:** Profile and emergency-contact screens, plus rider add, edit, list, and delete with address autocomplete and a map confirmation pin.
  - **Accept:** Each rider card shows name, photo, home, and destination; the delete confirmation names the consequence; a delete blocked by an active subscription shows why, not a raw `409`; the empty state invites adding a first rider.
  - **Verify:** Component tests for the states; a Detox flow adding a rider and seeing it listed; accessibility pass.
  - **Files:** `apps/mobile-consumer/app/(app)/riders/*.tsx`, `packages/ui/src/maps/AddressPicker.tsx`
  - **Skills:** frontend-ui-engineering, test-driven-development

### ✅ Checkpoint 0-D — Phase 0 exit: the foundation carries weight
- [ ] A parent can register, verify, add riders, and reach the consumer shell on a real device
- [ ] A driver can register, complete all four onboarding steps, and sit in pending verification
- [ ] The RBAC matrix suite and every auth abuse-case test are green
- [ ] Detox register flow green on iOS and Android
- [ ] No booking, matching, tracking, or payment exists yet — and nothing has been built that presumes them
- [ ] Definition of Done applied to every task above; `code-simplification` pass run over Phase 0
- [ ] Human review before Phase 1 begins

---

## Phase 1A — Route Matching and Discovery (`route-matching`, realistic: 3–4 weeks)

> Highest-risk phase in the MVP. It is first for that reason. If the P99 budget cannot be met on
> 500 drivers, that must surface here, not in week 15.

- [ ] **T1.01 — Matching service scaffold** · `S` · deps: T0.09, T-D.03
  - **Do:** FastAPI app with `/health`, structlog wired to the shared log shape, OTel tracing, the shared config loader, and a pytest harness with a PostGIS-backed fixture database.
  - **Accept:** `/health` reports database reachability; logs match the Node services' field set including `requestId` propagated from the gateway; the pytest fixture applies migrations and seeds deterministically.
  - **Verify:** `pytest tests/` green on the empty scaffold; a request through the gateway shows one continuous trace across both services.
  - **Files:** `apps/matching/app/main.py`, `apps/matching/app/config.py`, `apps/matching/tests/conftest.py`
  - **Skills:** observability-and-instrumentation, source-driven-development
- [ ] **T1.02 — Spatial candidate filter, with the TRD's aggregate bug fixed** · `M` · deps: T1.01, T0.13
  - **Do:** The `ST_DWithin` candidate query over `driver_profiles`, filtered on `status = 'APPROVED'` and an `operating_days` array overlap. **Compute the rating average and the active-rider count in separate subqueries or lateral joins** — the query as written in TRD §4.1 joins `reviews` and `subscriptions` under one `GROUP BY`, producing a cartesian product that makes both aggregates wrong (see `plan.md` §10.11).
  - **Accept:** A driver with 3 reviews and 4 active subscriptions reports the true 3-review average and a rider count of 4; the GIST index is used (confirmed by `EXPLAIN`); `PENDING`, `REJECTED`, and `SUSPENDED` drivers never appear.
  - **Verify:** A regression test seeding exactly that 3×4 case and asserting the true values — it must fail against the TRD's original query. An `EXPLAIN ANALYZE` assertion that `idx_dp_route` is used rather than a sequential scan.
  - **Files:** `apps/matching/app/matching/candidates.py`, `apps/matching/tests/test_candidates.py`
  - **Skills:** doubt-driven-development, test-driven-development, performance-optimization

- [ ] **T1.03 — Direction check, evaluated per leg** · `M` · deps: T1.02
  - **Do:** Project pickup and destination onto the polyline with `ST_ClosestPoint` + `ST_LineLocatePoint`. The outbound leg requires `pos_pickup < pos_dest`; the return leg requires the reverse (`pos_dest < pos_pickup`) against the same stored polyline. A `ROUND_TRIP` search must satisfy both legs. Per B1, decided 2026-08-23 — the literal TRD §4.1 Step 2 check applied to both legs makes every round-trip search return zero drivers.
  - **Accept:** An opposite-direction driver is excluded for a morning search; a `ROUND_TRIP` search on a valid corridor returns the same driver set as the equivalent morning search; pickup and destination projecting to the same position is excluded, not accepted; a driver eligible outbound but not on the return leg is excluded from `ROUND_TRIP` while still eligible for `MORNING`.
  - **Verify:** Tests for outbound match, reverse-direction exclusion, round-trip satisfying both legs, round-trip failing on the return leg only, and the degenerate same-position case. One test must fail under the literal TRD algorithm and pass under per-leg evaluation.
  - **Files:** `apps/matching/app/matching/direction.py`, `apps/matching/tests/test_direction.py`
  - **Skills:** doubt-driven-development, test-driven-development
- [ ] **T1.04 — Capacity check and seat accounting** · `S` · deps: T1.02
  - **Do:** Exclude a driver when `active_riders + 1 > seat_capacity`. Define the seat semantics explicitly: a `ROUND_TRIP` subscription occupies one seat, not two, and only `ACTIVE` subscriptions count — `PENDING` ones do not reserve a seat.
  - **Accept:** A driver at capacity is excluded; a driver with one free seat is included; a `PENDING` request does not consume the last seat (which is what makes the `T1.16` conflict lock necessary); `PAUSED` and `CANCELLED` subscriptions free their seat.
  - **Verify:** Tests at capacity, one below, and one with a pending request against the last seat.
  - **Files:** `apps/matching/app/matching/capacity.py`, `apps/matching/tests/test_capacity.py`
  - **Skills:** test-driven-development
- [ ] **T1.05 — Timing conflict check and trip-duration estimation** · `M` · deps: T1.04, T-D.05
  - **Do:** Build the requested window as `[requestedTime − buffer, requestedTime + buffer + estimatedTripDuration]` and compare against `driver_schedule_slots` for the overlapping operating days. `estimatedTripDuration` is undefined in the TRD — implement it explicitly (Distance Matrix, with a haversine-plus-speed-factor fallback, cached). Apply whatever strictness B4 decided.
  - **Accept:** The estimator is deterministic for a given input and cached; a Maps failure falls back rather than failing the search; an exactly-adjacent slot is handled per the B4 decision, and the chosen behaviour is asserted; day-of-week overlap uses array intersection, not equality.
  - **Verify:** Tests for exact-boundary adjacency, full containment, partial overlap on one shared day, no shared days, and the Maps-unavailable fallback path.
  - **Files:** `apps/matching/app/matching/timing.py`, `apps/matching/app/maps/duration.py`, `apps/matching/tests/test_timing.py`
  - **Skills:** doubt-driven-development, test-driven-development, source-driven-development
- [ ] **T1.06 — Composite scoring and deterministic ranking** · `M` · deps: T1.03, T1.05, T-D.06
  - **Do:** Implement the five weighted signals from PRD §7.4 — proximity 40%, timing 25%, rating 20%, capacity headroom 10%, acceptance rate 5%. Normalise every component to 0–1. Add an explicit tie-break chain (score, then rating, then driver id) so ordering is stable. Cap results at 20.
  - **Accept:** Identical inputs always produce an identical ordering; every component is bounded 0–1 so no signal can dominate through scale; a driver with no reviews gets a defined neutral rating rather than a null-propagated score; the composite is auditable — the response carries the component breakdown.
  - **Verify:** Tests asserting stability across repeated runs and shuffled input order, each weight's isolated effect, the no-reviews case, and that the weights sum to 1.0.
  - **Files:** `apps/matching/app/matching/scoring.py`, `apps/matching/tests/test_scoring.py`
  - **Skills:** doubt-driven-development, test-driven-development
- [ ] **T1.07 — Edge-case and property suite for the whole filter chain** · `M` · deps: T1.06
  - **Do:** Adversarial cases: pickup exactly at `R_pickup`, a degenerate two-point polyline, a driver with `seat_capacity = 1`, a DST transition inside the requested window, midnight-crossing windows, an antimeridian-crossing route, identical pickup and destination, and a driver whose route doubles back on itself.
  - **Accept:** Every case has a documented expected outcome and a passing test; nothing raises an unhandled exception; matching-service coverage is at least 90% line and 85% branch.
  - **Verify:** `pytest --cov=app` meets the thresholds; the DST case is asserted against a real timezone, not UTC.
  - **Files:** `apps/matching/tests/test_edge_cases.py`, `apps/matching/tests/test_properties.py`
  - **Skills:** test-driven-development, doubt-driven-development
- [ ] **T1.08 — `GET /drivers/search` gateway endpoint** · `M` · deps: T1.06, T0.29
  - **Do:** Validate all eight query parameters with the contracts schema, enforce rider ownership, proxy to the matching service with the trace context, cap at 30 requests/user/minute, and cache results in Redis for 2 minutes keyed on the normalised query. Map a matching-service outage to `503` with `Retry-After: 30`.
  - **Accept:** A missing parameter returns `400 MISSING_PARAMS`; an ungeocodable point returns `422 NO_ROUTE_FOUND`; a consumer cannot search on another consumer's `riderId`; the response carries `totalEligible` and `searchRadiusMetres`; zero results is `200` with an empty list, not `404`.
  - **Verify:** Integration tests per error code, the ownership rejection, the rate limit, a cache hit, and the `503` path with the matching service stopped.
  - **Files:** `apps/api/src/search/search.controller.ts`, `apps/api/src/search/matching.client.ts`, `apps/api/test/search.integration.test.ts`
  - **Skills:** api-and-interface-design, security-and-hardening, test-driven-development

- [ ] **T1.09 — Matching performance harness and baseline** · `M` · deps: T1.08
  - **Do:** Seed 500 approved drivers with realistic city polylines and 2,000 subscriptions. Measure end-to-end search latency with a fixed request count, record the baseline, and confirm the GIST index is used at that scale. Publish the numbers.
  - **Accept:** P50 under 120 ms and P99 under 400 ms per TRD §4.5, measured, not assumed; the plan shows an index scan; if the target is missed, the harness output is the input to a `performance-optimization` cycle before Phase 1B starts.
  - **Verify:** The harness runs in CI nightly and fails on a regression beyond run-to-run variance; baseline and any subsequent attempt recorded in `PERF.md`, reverted attempts included.
  - **Files:** `apps/matching/tests/perf/test_search_latency.py`, `apps/matching/tests/perf/seed_500.py`, `PERF.md`
  - **Skills:** performance-optimization, observability-and-instrumentation
- [ ] **T1.10 — Daily precompute job for `acceptance_rate` and typical departure time** · `S` · deps: T0.12, T1.06
  - **Do:** A BullMQ repeatable job computing each driver's acceptance rate over a trailing window and their typical departure time from committed slots, writing both to `driver_profiles`. Both columns are read by scoring and neither exists in the TRD DDL.
  - **Accept:** A driver with no requests yet gets a defined neutral value rather than null; the job is idempotent within a day; a failure leaves the previous values intact rather than zeroing them.
  - **Verify:** Tests for the no-history case, idempotent re-run, and failure isolation; a scoring test asserting a stale value still produces a valid composite.
  - **Files:** `apps/worker/src/driver-stats.job.ts`, `apps/worker/test/driver-stats.test.ts`
  - **Skills:** test-driven-development, observability-and-instrumentation
- [ ] **T1.11 — Search input screen (mobile)** · `M` · deps: T1.08, T0.44
  - **Do:** Rider selection, home and destination prefilled from the rider record with an override, a time picker, a day-of-week selector, and a subscription-type selector. Validate against the shared contracts schema before dispatching.
  - **Accept:** Defaults come from the selected rider so the common case is one tap; every invalid combination is blocked client-side with the same message the server would give; loading state is a skeleton, not a spinner over a blank screen.
  - **Verify:** Component tests for the defaults, validation blocks, and loading state; keyboard and screen-reader pass.
  - **Files:** `apps/mobile-consumer/app/(app)/search/index.tsx`, `apps/mobile-consumer/app/(app)/search/index.test.tsx`
  - **Skills:** frontend-ui-engineering, test-driven-development
- [ ] **T1.12 — Search results and driver card (mobile)** · `M` · deps: T1.11
  - **Do:** A ranked result list with a driver card showing name, photo, vehicle, rating with review count, current riders against capacity, estimated pickup time, pickup distance, verification tier, and monthly price. Distinct empty state for "no eligible driver", error state with retry, and a skeleton list while loading.
  - **Accept:** The no-match state explains *why* nothing matched and offers a concrete next action (widen time, change days) rather than a dead end; price is formatted from integer cents with the currency; rating is never rendered as a bare `null`; the list is virtualised.
  - **Verify:** Component tests for populated, empty, error, and loading states; a snapshot of the price formatter across currencies; accessibility pass on the card.
  - **Files:** `apps/mobile-consumer/app/(app)/search/results.tsx`, `packages/ui/src/components/DriverCard.tsx`, `packages/ui/src/components/DriverCard.test.tsx`
  - **Skills:** frontend-ui-engineering, test-driven-development
- [ ] **T1.13 — Driver profile screen (mobile)** · `S` · deps: T1.12
  - **Do:** Full driver detail: photo, vehicle details, plate, verification tier and what it means, rating distribution, verified reviews list with pagination, and the corridor overlap drawn on a map.
  - **Accept:** Reviews paginate; the map shows the driver's route and the rider's two points without exposing any other rider's data; the verification tier links to an explanation of what was checked.
  - **Verify:** Component tests; a test asserting the response contains no other rider's identifiers; accessibility pass.
  - **Files:** `apps/mobile-consumer/app/(app)/drivers/[id].tsx`, `apps/api/src/drivers/public-profile.controller.ts`
  - **Skills:** frontend-ui-engineering, security-and-hardening

### ✅ Checkpoint 1-A — discovery works and is fast enough
- [ ] A parent searches and gets a deterministic, ranked list of genuinely eligible drivers
- [ ] Every hard filter has a failing-then-passing test, including the round-trip return leg
- [ ] The aggregate-fan-out regression test fails against the TRD's original query and passes against ours
- [ ] P50 < 120 ms and P99 < 400 ms measured at 500 drivers, with numbers in `PERF.md`
- [ ] Matching-service coverage ≥ 90% line / 85% branch
- [ ] Doubt-driven review completed on the eligibility filter set

---

## Phase 1B — Subscription Lifecycle (`subscriptions`, realistic: 2 weeks)

- [ ] **T1.14 — Create a subscription request, idempotently** · `M` · deps: T1.08
  - **Do:** `POST /subscriptions` creating a `PENDING` subscription. Honour the `Idempotency-Key` header by claiming it in a single atomic insert against the `idempotency_keys` unique constraint — never `SELECT` then `INSERT`. Store the request hash. Re-run the eligibility check server-side; never trust the client's claim that this driver matched.
  - **Accept:** The same key with the same body replays the original response; the same key with a different body returns `422`; a second in-flight duplicate returns `409` (a deliberate choice, documented); key retention outlives the longest retry path; a driver who is no longer eligible is rejected at creation, not at acceptance.
  - **Verify:** Tests for replay, payload mismatch, in-flight duplicate, and stale eligibility. A concurrency test firing two identical requests simultaneously and asserting exactly one subscription row.
  - **Files:** `apps/api/src/subscriptions/subscriptions.controller.ts`, `apps/api/src/common/idempotency.service.ts`, `apps/api/test/subscription-create.integration.test.ts`
  - **Skills:** api-and-interface-design, doubt-driven-development, test-driven-development
- [ ] **T1.15 — Schedule-preview endpoint for the driver** · `S` · deps: T1.14
  - **Do:** Return what the driver's roster would look like if they accepted: the merged slot list, the re-optimised pickup order, and any warning about tightness against committed windows. Read-only — it must not write slots.
  - **Accept:** The preview is computed without mutating any row; it shows the delta against today's roster; it surfaces the same conflict verdict acceptance would reach, so a driver is never shown "no conflict" then refused.
  - **Verify:** A test asserting zero writes during a preview; a test asserting the preview verdict matches the `T1.16` acceptance verdict for the same inputs.
  - **Files:** `apps/api/src/subscriptions/preview.controller.ts`, `apps/api/test/subscription-preview.integration.test.ts`
  - **Skills:** api-and-interface-design, test-driven-development
- [ ] **T1.16 — Atomic acceptance with the SERIALIZABLE conflict lock** · `M` · deps: T1.15, T1.05
  - **Do:** `POST /subscriptions/:id/accept` inside a `SERIALIZABLE` transaction: `SELECT … FOR UPDATE` on the driver's slots, re-check conflicts, then insert the slot and flip the subscription to `ACTIVE` — or roll back and return `409 RACE_CONFLICT`. Retry exactly once on serialisation failure (SQLSTATE `40001`), then surface the conflict.
  - **Accept:** No path writes a slot outside the transaction; the retry is bounded at one; a driver who is now at capacity or in conflict is refused with the conflicting slot in `details`; only the owning driver can accept; accepting an already-`ACTIVE` or `CANCELLED` subscription is rejected.
  - **Verify:** Failing-then-passing tests for each rejection. Then `T1.17`.
  - **Files:** `apps/api/src/subscriptions/accept.service.ts`, `apps/api/test/subscription-accept.integration.test.ts`
  - **Skills:** doubt-driven-development, security-and-hardening, test-driven-development
- [ ] **T1.17 — Concurrency proof: no double-booking** · `S` · deps: T1.16
  - **Do:** A test firing 50 concurrent acceptance requests against a driver with exactly one free seat, and a second variant with two overlapping-window requests against a driver with free capacity.
  - **Accept:** Exactly one subscription becomes `ACTIVE` in the capacity case; exactly one in the overlapping-window case; every loser receives `409`, never a `500`; zero orphan slots; the driver's slot count matches their active-subscription count afterwards.
  - **Verify:** The test runs in CI on every PR touching `subscriptions` or `driver_schedule_slots`, and is repeated 20 times in the nightly job to catch flakiness. An invariant assertion after each run: slot count equals active-subscription count.
  - **Files:** `apps/api/test/subscription-concurrency.integration.test.ts`
  - **Skills:** test-driven-development, doubt-driven-development
- [ ] **T1.18 — Decline, and the 24-hour auto-decline job** · `S` · deps: T1.16
  - **Do:** `POST /subscriptions/:id/decline` with a reason, plus a repeatable job that auto-declines any request still `PENDING` after 24 hours. Notify the consumer either way.
  - **Accept:** Auto-decline is idempotent — running the job twice does not double-notify; the acceptance-rate calculation counts an auto-decline correctly per the definition in `T1.10`; the reason is sanitised and length-capped.
  - **Verify:** Tests for manual decline, auto-decline at the boundary, double-run idempotency, and the notification firing exactly once.
  - **Files:** `apps/api/src/subscriptions/decline.service.ts`, `apps/worker/src/auto-decline.job.ts`, `apps/api/test/subscription-decline.integration.test.ts`
  - **Skills:** test-driven-development, api-and-interface-design

- [ ] **T1.19 — TSP re-optimisation of the pickup order** · `M` · deps: T1.16
  - **Do:** Nearest-neighbour for 8 stops or fewer; OR-Tools with guided local search and a hard 1-second limit for 9–15; fall back to the existing order if no solution is found. Apply the ±5-minute time-window constraint per committed pickup. Write `pickup_order` back inside the acceptance transaction so the roster and the order never diverge.
  - **Accept:** No committed pickup window is violated by a re-optimisation — this is the invariant, and a solution that violates it is rejected in favour of the fallback; the 1-second cap is enforced; the order is written in the same transaction as the slot.
  - **Verify:** Tests at 1, 8, 9, and 15 stops; a case where the optimal distance order would violate a window, asserting the window wins; a forced no-solution case asserting the fallback; a timing test asserting ≤8 stops completes under 10 ms and 9–15 under 200 ms.
  - **Files:** `apps/matching/app/optimise/tsp.py`, `apps/matching/tests/test_tsp.py`
  - **Skills:** doubt-driven-development, test-driven-development, source-driven-development, performance-optimization
- [ ] **T1.20 — Cancellation with 7-day notice** · `M` · deps: T1.16
  - **Do:** `POST /subscriptions/:id/cancel` by either party, recording who cancelled, the reason, and the effective date 7 days out. Free the schedule slot and the seat on the effective date, not on request. Notify the other party.
  - **Accept:** The seat is not freed early, so trips inside the notice window still run; a cancellation already in flight cannot be re-requested; only the consumer who owns the rider or the driver who owns the roster may cancel; billing interaction is defined explicitly (no charge lands after the effective date).
  - **Verify:** Tests for both parties cancelling, an unauthorised third party, double cancellation, and the seat freeing exactly on the effective date via a controlled clock.
  - **Files:** `apps/api/src/subscriptions/cancel.service.ts`, `apps/worker/src/cancellation-effect.job.ts`, `apps/api/test/subscription-cancel.integration.test.ts`
  - **Skills:** test-driven-development, api-and-interface-design
- [ ] **T1.21 — Subscription list and detail endpoints** · `S` · deps: T1.16
  - **Do:** `GET /subscriptions/:id` and a role-aware paginated `GET /subscriptions` — a consumer sees their riders' subscriptions, a driver sees their roster. Filterable by status.
  - **Accept:** Pagination is present and bounded; a consumer cannot read a subscription belonging to another consumer's rider; the driver's view exposes the rider's name and pickup point but not the consumer's unrelated riders; both shapes match `packages/contracts`.
  - **Verify:** Tests for pagination bounds, cross-tenant access rejection, and field-level exposure per role.
  - **Files:** `apps/api/src/subscriptions/query.controller.ts`, `apps/api/test/subscription-query.integration.test.ts`
  - **Skills:** api-and-interface-design, security-and-hardening
- [ ] **T1.22 — Subscription request flow (mobile, consumer)** · `M` · deps: T1.13, T1.14
  - **Do:** Pick subscription type, pickup time, and start date; show a review screen with the driver, schedule, and monthly price; submit with a client-generated `Idempotency-Key` reused across retries; then a pending state screen with the 24-hour expectation.
  - **Accept:** The idempotency key is generated once per intent and reused on retry, never regenerated per attempt; a `409 CONFLICT_DETECTED` renders as an explanation plus a "find another driver" action; the pending screen states the deadline.
  - **Verify:** A component test asserting a retried submit sends the same key; tests for the conflict and success paths; accessibility pass.
  - **Files:** `apps/mobile-consumer/app/(app)/subscribe/*.tsx`, `packages/ui/src/api/idempotency.ts`
  - **Skills:** frontend-ui-engineering, api-and-interface-design
- [ ] **T1.23 — Request inbox and accept/decline (mobile, driver)** · `M` · deps: T1.15, T1.16, T1.18
  - **Do:** A request list with time remaining, a detail screen showing the rider, addresses, schedule, and monthly earnings, the schedule-delta preview from `T1.15`, and accept/decline actions with a decline-reason sheet.
  - **Accept:** The delta preview shows the before and after pickup order; the countdown reflects the real 24-hour deadline; a `409 RACE_CONFLICT` on accept renders as a clear "someone else took this slot" message and refreshes the list; the empty inbox state is informative.
  - **Verify:** Component tests for the states including the race conflict; a Detox flow accepting a request end to end.
  - **Files:** `apps/mobile-driver/app/(app)/requests/*.tsx`
  - **Skills:** frontend-ui-engineering, test-driven-development
- [ ] **T1.24 — Subscription lifecycle notifications** · `S` · deps: T1.16, T1.18, T1.20, T0.35
  - **Do:** Push plus email for `SUBSCRIPTION_ACCEPTED`, `SUBSCRIPTION_DECLINED`, and `SUBSCRIPTION_CANCELLED`; push to the driver on a new request. Include the agreed schedule in the acceptance email.
  - **Accept:** Every notification carries the deep-link data payload; the emails render correctly in a plain-text client; no notification contains a rider's home address in its preview text (it appears on a lock screen).
  - **Verify:** Tests asserting each event enqueues exactly one job per recipient; a manual review of every rendered template for address leakage in the preview line.
  - **Files:** `apps/api/src/notifications/templates/subscription.*`, `apps/api/test/subscription-notifications.integration.test.ts`
  - **Skills:** observability-and-instrumentation, security-and-hardening

### ✅ Checkpoint 1-B — the core promise holds under concurrency
- [ ] Discovery → request → accept works end to end on real devices, both roles
- [ ] 50 concurrent acceptances on the last seat produce exactly one `ACTIVE` subscription, zero orphan slots
- [ ] The preview verdict and the acceptance verdict always agree
- [ ] No TSP result violates a committed pickup window
- [ ] Doubt-driven review completed on the conflict lock and the TSP window constraint
- [ ] `code-simplification` pass over Phase 1A + 1B

---

## Phase 1C — Trips and Live Tracking (`trips`, `realtime-tracking`, realistic: 3–4 weeks)

- [ ] **T1.25 — Daily trip generation job** · `M` · deps: T1.16, T-D.06
  - **Do:** A repeatable job materialising tomorrow's trips from active subscriptions crossed with operating days, respecting the city timezone. One row per `(subscriptionId, scheduledDate, type)`, guarded by the existing unique constraint. Skip subscriptions cancelled with an effective date on or before the target day.
  - **Accept:** Re-running the job for the same date creates nothing new; a non-operating day generates no trip; a `ROUND_TRIP` subscription generates exactly two trips; DST transitions do not shift or duplicate a day; the job is safe to run late (catch-up for a missed day).
  - **Verify:** Tests for idempotent re-run, non-operating day, round-trip pair, DST spring-forward and fall-back, and a catch-up run. A controlled clock, never `new Date()` in the logic.
  - **Files:** `apps/worker/src/trip-generation.job.ts`, `apps/worker/test/trip-generation.test.ts`
  - **Skills:** test-driven-development, doubt-driven-development
- [ ] **T1.26 — Trip list and driver run list** · `S` · deps: T1.25
  - **Do:** Role-aware `GET /trips` filterable by date and status, and `GET /drivers/me/schedule` returning today's run ordered by `pickup_order` with each rider's name, address, phone, and notes. Cache the driver's list in Redis for 30 seconds, invalidated on any status change.
  - **Accept:** A consumer sees only their own riders' trips; the driver's list is in optimised order, not insertion order; the cache is invalidated on a status change so a driver never sees a stale "not picked up"; a rider's phone is exposed only to the driver assigned to them.
  - **Verify:** Tests for cross-tenant isolation, ordering, cache invalidation on transition, and phone-field exposure per role.
  - **Files:** `apps/api/src/trips/trips.controller.ts`, `apps/api/test/trips-query.integration.test.ts`
  - **Skills:** api-and-interface-design, security-and-hardening, performance-optimization
- [ ] **T1.27 — Trip state machine: pickup and dropoff** · `M` · deps: T1.26
  - **Do:** `PATCH /trips/:id/pickup` and `/dropoff`, recording the actual timestamp and the driver's coordinates. Implement the transitions as an explicit state machine — `SCHEDULED → IN_PROGRESS → COMPLETED`, with `MISSED` and `CANCELLED` as terminal states. Only the owning driver may transition. Replaying the same transition is a no-op, not an error, because the mobile offline queue will retry.
  - **Accept:** No illegal transition is reachable (dropoff before pickup, pickup on a `COMPLETED` trip, transition on another driver's trip); replay is idempotent and does not overwrite the original timestamp; the last rider being dropped off marks the trip `COMPLETED`.
  - **Verify:** An exhaustive transition-matrix test over every state pair asserting allow or reject; an idempotent-replay test asserting the first timestamp survives.
  - **Files:** `apps/api/src/trips/state-machine.ts`, `apps/api/src/trips/status.controller.ts`, `apps/api/test/trip-transitions.integration.test.ts`
  - **Skills:** doubt-driven-development, test-driven-development, api-and-interface-design
- [ ] **T1.28 — Trip cancellation for driver absence** · `S` · deps: T1.27
  - **Do:** `PATCH /trips/:id/cancel` with a reason, fanning out a notification to every affected consumer in one action. Record it against the driver's reliability counters for the strike policy.
  - **Accept:** Every affected consumer is notified exactly once; cancelling an already-completed trip is rejected; the reason is sanitised; the cancellation is visible in the consumer's trip history with the reason.
  - **Verify:** Tests for the fan-out count, the completed-trip rejection, and the history entry.
  - **Files:** `apps/api/src/trips/cancel.controller.ts`, `apps/api/test/trip-cancel.integration.test.ts`
  - **Skills:** test-driven-development, observability-and-instrumentation
- [ ] **T1.29 — Location service: authenticated WebSocket hub** · `M` · deps: T0.27, T-D.04
  - **Do:** A Socket.IO server authenticating the access token on the upgrade handshake and disconnecting with code `4001` when it is invalid or expired. Rooms per driver. Redis adapter for cross-node fan-out. Drivers sticky-sessioned at the ALB; consumers not.
  - **Accept:** An unauthenticated or expired token never establishes a connection; a token expiring mid-connection causes a re-auth or a disconnect rather than an indefinitely trusted socket; a publish on node A reaches a subscriber on node B.
  - **Verify:** Tests for no token, malformed token, expired token, and mid-connection expiry; a two-node integration test for cross-node delivery.
  - **Files:** `apps/location/src/gateway.ts`, `apps/location/src/auth.middleware.ts`, `apps/location/test/ws-auth.integration.test.ts`
  - **Skills:** security-and-hardening, test-driven-development, source-driven-development
- [ ] **T1.30 — Location ingest, fan-out, and batched persistence** · `M` · deps: T1.29
  - **Do:** Handle `location:update`, validate the payload, write to a Redis ZSET keyed by driver, publish to the driver's channel, and append to `location_logs` in 30-second batches. Enforce 30 emissions per driver per minute, dropping excess silently. Reject an update for a trip that is not `IN_PROGRESS`.
  - **Accept:** Coordinates are range-validated; an update for someone else's trip is rejected; excess emissions are dropped without disconnecting the driver; a batch write failure does not lose the live stream; no coordinate finer than 2dp reaches any log line.
  - **Verify:** Tests for the rate cap, the wrong-trip rejection, coordinate validation, batch flush, and batch-failure isolation.
  - **Files:** `apps/location/src/location.handler.ts`, `apps/location/src/log-batcher.ts`, `apps/location/test/location-ingest.integration.test.ts`
  - **Skills:** security-and-hardening, observability-and-instrumentation, test-driven-development

- [ ] **T1.31 — Location authorisation: the invariant that matters most** · `M` · deps: T1.30
  - **Do:** On subscribe, verify the requesting user has an `ACTIVE` subscription with that driver *and* that the driver is currently running a trip involving one of that user's riders. Re-verify on subscription cancellation and force-unsubscribe. Admins may subscribe; nobody else can.
  - **Accept:** A consumer with no subscription to that driver cannot subscribe to the channel; a consumer whose subscription was cancelled loses the stream immediately, not at the next reconnect; a driver cannot subscribe to another driver's channel; a `PENDING` subscription grants nothing.
  - **Verify:** Adversarial test suite covering each of the four cases plus a channel-name-guessing attempt and a token-swap attempt mid-connection. This is a doubt-driven artefact — fresh-context adversarial review required before merge.
  - **Files:** `apps/location/src/subscribe.guard.ts`, `apps/location/test/location-authz.integration.test.ts`
  - **Skills:** security-and-hardening, doubt-driven-development, test-driven-development
- [ ] **T1.32 — Location retention purge job** · `S` · deps: T1.30, T-D.08
  - **Do:** A daily job hard-deleting `location_logs` rows older than 30 days and trimming the Redis ZSETs. No archive in the MVP (ADR-010). Log the deleted row count as a metric so the job's silence is detectable.
  - **Accept:** A 31-day-old row is gone; a 29-day-old row survives; the job is idempotent; a run that deletes nothing when it should emits a warning rather than passing quietly.
  - **Verify:** Tests at the 29-, 30-, and 31-day boundaries with a controlled clock; a metric assertion that the deleted count is exported.
  - **Files:** `apps/worker/src/location-purge.job.ts`, `apps/worker/test/location-purge.test.ts`
  - **Skills:** security-and-hardening, observability-and-instrumentation
- [ ] **T1.33 — Geofence-triggered arrival notifications** · `M` · deps: T1.30, T0.35
  - **Do:** Server-side geofence evaluation on each location update using `ST_DWithin` — the client runs no geofence logic. Emit `DRIVER_EN_ROUTE` on trip start, `DRIVER_ARRIVING_SOON` at the 500 m boundary, and the safe-arrival notification at the destination polygon.
  - **Accept:** Each geofence notification fires at most once per trip, guarded by the dedupe key, even though updates arrive every 5 seconds; crossing the boundary back and forth does not re-notify; the evaluation adds under 5 ms to the update path.
  - **Verify:** A test replaying a recorded coordinate track across the boundary in both directions and asserting exactly one notification; a latency assertion on the evaluation.
  - **Files:** `apps/location/src/geofence.service.ts`, `apps/location/test/geofence.integration.test.ts`
  - **Skills:** observability-and-instrumentation, test-driven-development, performance-optimization
- [ ] **T1.34 — Trip status notifications** · `S` · deps: T1.27, T0.35
  - **Do:** `RIDER_PICKED_UP` and `RIDER_DROPPED_OFF` push on each transition, plus the `rider:picked_up` / `rider:dropped_off` / `trip:status_changed` WebSocket events to the watching consumer.
  - **Accept:** A replayed transition from the offline queue does not send a duplicate notification; the push arrives within the 2-second p50 target; the notification names the rider so a parent with three children knows which one.
  - **Verify:** Tests asserting one notification per logical transition under replay; an end-to-end timing measurement from tap to device.
  - **Files:** `apps/api/src/notifications/templates/trip.*`, `apps/api/test/trip-notifications.integration.test.ts`
  - **Skills:** observability-and-instrumentation, test-driven-development
- [ ] **T1.35 — Driver run screen with location emission** · `M` · deps: T1.26, T1.30, T0.32
  - **Do:** Today's run list in pickup order, a "start run" action, and background location emission via an Android foreground service with a clear purpose notification and the iOS equivalent. `distanceFilter: 20`, 5-second interval while a trip is `IN_PROGRESS`, 60 seconds idle. Buffer up to 200 points in memory and flush on reconnect. Stop emitting when the run ends.
  - **Accept:** Emission happens only during an `IN_PROGRESS` trip; the foreground notification states why location is being used; killing the app stops emission; a 10-minute tunnel produces a gap, not a crash or a duplicate flood on reconnect; permission denial degrades to manual status updates rather than blocking the run.
  - **Verify:** Device tests for background emission, app kill, airplane-mode reconnect flush, and permission denial. A battery measurement over a simulated 45-minute run, recorded in `PERF.md`.
  - **Files:** `apps/mobile-driver/app/(app)/run/index.tsx`, `packages/ui/src/location/emitter.ts`, `packages/ui/src/location/emitter.test.ts`
  - **Skills:** frontend-ui-engineering, source-driven-development, performance-optimization
- [ ] **T1.36 — One-tap pickup and dropoff with an offline queue** · `M` · deps: T1.35, T1.27
  - **Do:** Per-rider picked-up and dropped-off actions with optimistic UI. Queue the mutation in AsyncStorage when offline and replay it on reconnect in order, relying on `T1.27`'s idempotency. Show a pending-sync indicator per rider.
  - **Accept:** A tap while offline updates the UI, persists across an app restart, and syncs on reconnect; replay never produces a duplicate notification; a permanently failing mutation surfaces to the driver rather than silently vanishing; the original tap time is preserved, not the sync time.
  - **Verify:** Tests for offline tap, app restart with a pending queue, ordered replay, and a poison mutation; a Detox flow completing a full run offline then reconnecting.
  - **Files:** `apps/mobile-driver/app/(app)/run/rider-actions.tsx`, `packages/ui/src/offline/mutation-queue.ts`, `packages/ui/src/offline/mutation-queue.test.ts`
  - **Skills:** frontend-ui-engineering, doubt-driven-development, test-driven-development

- [ ] **T1.37 — Consumer live-tracking screen** · `M` · deps: T1.31, T1.34, T0.32
  - **Do:** A live map with the driver's marker, the route polyline, the rider's pickup and destination pins, a status timeline (Scheduled → En Route → Picked Up → In Transit → Dropped Off), and an ETA countdown. Exponential reconnect with jitter, capped at 30 seconds.
  - **Accept:** A stale position (no update for 30 seconds) is visibly marked stale rather than shown as current; the map does not re-centre and fight the user's pan; a disconnected socket shows a reconnecting state, not a frozen map presented as live; no other rider's data appears.
  - **Verify:** Component tests for the live, stale, disconnected, and completed states; a device test killing the network mid-trip; accessibility pass on the timeline.
  - **Files:** `apps/mobile-consumer/app/(app)/track/[tripId].tsx`, `packages/ui/src/maps/LiveMap.tsx`
  - **Skills:** frontend-ui-engineering, source-driven-development
- [ ] **T1.38 — Multi-rider dashboard and offline schedule cache** · `M` · deps: T1.37
  - **Do:** A unified home screen showing every rider's trip status for today, with quick entry into any active trip. Cache today's schedule in AsyncStorage so it reads offline. Cached data is labelled with its age.
  - **Accept:** A parent with three children sees three statuses on one screen without scrolling on a 320 px device; offline shows the cached schedule clearly marked as cached with a timestamp, never presented as live; the cache expires after 24 hours.
  - **Verify:** Component tests at all four breakpoints with one, three, and five riders; an offline test asserting the staleness label; accessibility pass.
  - **Files:** `apps/mobile-consumer/app/(app)/index.tsx`, `packages/ui/src/offline/schedule-cache.ts`
  - **Skills:** frontend-ui-engineering, test-driven-development
- [ ] **T1.39 — Realtime load test** · `S` · deps: T1.30, T1.37
  - **Do:** A k6 scenario with 50 concurrent drivers emitting every 5 seconds and 300 consumers watching, per TRD §13.3.
  - **Accept:** Zero WebSocket drops; P99 broadcast under 60 ms; no memory growth trend over a 15-minute run; the batched log writer keeps up without unbounded queue growth.
  - **Verify:** Run against staging; record the numbers in `PERF.md`; wire it into the pre-launch gate, not every PR.
  - **Files:** `tests/load/realtime_morning_rush.js`, `PERF.md`
  - **Skills:** performance-optimization, observability-and-instrumentation

### ✅ Checkpoint 1-C — a parent can actually watch the ride
- [ ] End to end on real devices: driver starts a run, marks pickup, parent sees live movement and gets all four notifications
- [ ] Location authorisation suite green, including every adversarial case; doubt-driven review completed
- [ ] Trip transition matrix exhaustively tested; offline replay produces no duplicates
- [ ] Purge job verified at the 29/30/31-day boundaries
- [ ] Realtime load test passes: zero drops, P99 < 60 ms
- [ ] Battery measurement recorded for a 45-minute run

---

## Phase 1D — Payments and Payouts (`payments`, realistic: 3 weeks)

- [ ] **T1.40 — Stripe client, customers, and payment-method setup** · `M` · deps: T0.29, T-D.06
  - **Do:** Initialise `stripe-node` with the API version pinned to `2024-06-20`. Create a Stripe customer on first payment-method add and store the id. Implement the SetupIntent flow so card data never touches RouteRide servers.
  - **Accept:** The API version is pinned in the constructor, not inherited from the account default; no card number, CVC, or expiry is ever accepted by, logged by, or stored on our servers; the Stripe secret comes from the config loader, never a literal.
  - **Verify:** Tests in Stripe test mode for a successful setup and a declined card; a grep assertion over the codebase that no field named like a PAN is persisted; PCI DSS SAQ A scope confirmed in writing.
  - **Files:** `apps/api/src/payments/stripe.client.ts`, `apps/api/src/payments/setup-intent.controller.ts`, `apps/api/test/payment-setup.integration.test.ts`
  - **Skills:** security-and-hardening, source-driven-development, test-driven-development
- [ ] **T1.41 — Payment-method CRUD** · `S` · deps: T1.40, T0.12
  - **Do:** Add, list, and delete payment methods against the `payment_methods` table added in `T0.12`, storing only the Stripe id, brand, last four digits, and expiry. Block deletion of the last method while an active subscription exists.
  - **Accept:** The response exposes brand, last four, and expiry only — never a raw Stripe object; a consumer cannot see or delete another consumer's method; deleting the last method with an active subscription returns `409` with a clear reason.
  - **Verify:** Tests for the field allowlist, cross-tenant rejection, and the last-method conflict.
  - **Files:** `apps/api/src/payments/methods.controller.ts`, `apps/api/test/payment-methods.integration.test.ts`
  - **Skills:** api-and-interface-design, security-and-hardening

- [ ] **T1.42 — Monthly charge job with derived idempotency** · `M` · deps: T1.41, T1.16
  - **Do:** A daily job charging every subscription whose `next_billing_date` is due. The idempotency key is `charge:v1:{subscriptionId}:{billingDate}` — derived from the intent, stable across retries, and different next month. Insert the `payments` row *before* calling Stripe (intent before action), then reconcile from the PaymentIntent result. Advance `next_billing_date` only on success.
  - **Accept:** Running the job twice on the same day charges once; a crash between the insert and the Stripe call leaves a `PENDING` row that reconciliation resolves rather than a silent double charge; a timeout is treated as *unknown*, not as failure, and is resolved by querying Stripe; month-end dates (31st → February) are handled by an explicit documented rule.
  - **Verify:** Tests for double run, mid-call crash simulation, timeout-then-reconcile, the month-end rule, and a subscription cancelled with an effective date before the billing date receiving no charge.
  - **Files:** `apps/worker/src/billing.job.ts`, `apps/api/src/payments/charge.service.ts`, `apps/worker/test/billing.test.ts`
  - **Skills:** doubt-driven-development, api-and-interface-design, test-driven-development
- [ ] **T1.43 — Stripe webhook receiver** · `M` · deps: T1.42
  - **Do:** `POST /payments/webhook/stripe` reading the raw body, verifying the signature with `constructEvent`, deduplicating on the event id with a 30-day Redis TTL, and dispatching to typed handlers. No user rate limit; non-Stripe source IPs blocked at the WAF.
  - **Accept:** A body-parsing middleware never touches this route (signature verification needs the raw buffer); an invalid signature returns `400` and is not processed; a replayed event id acknowledges without re-processing; an unknown event type acknowledges without erroring; the endpoint returns 200 fast and does the work on the queue.
  - **Verify:** Tests for a valid signature, a tampered body, a replayed event, an unknown type, and an out-of-order event pair (`succeeded` arriving after `failed`).
  - **Files:** `apps/api/src/payments/webhook.controller.ts`, `apps/api/src/payments/event-handlers.ts`, `apps/api/test/payment-webhook.integration.test.ts`
  - **Skills:** security-and-hardening, api-and-interface-design, test-driven-development
- [ ] **T1.44 — Dunning: retry, pause, notify** · `S` · deps: T1.43
  - **Do:** Three automatic retries over five days on a failed charge, then move the subscription to `PAUSED` and notify both parties. Push, email, and SMS on failure per TRD §11.
  - **Accept:** Retries respect the schedule and reuse the same idempotency key; the fourth failure pauses rather than retrying forever; the driver is told a rider is paused so they do not wait at the gate; the consumer gets an actionable message with a way to update the card.
  - **Verify:** Tests walking the full failure timeline with a controlled clock, asserting the pause at the right point and exactly one notification per stage.
  - **Files:** `apps/worker/src/dunning.job.ts`, `apps/worker/test/dunning.test.ts`
  - **Skills:** test-driven-development, observability-and-instrumentation
- [ ] **T1.45 — Payment idempotency and replay suite** · `S` · deps: T1.43
  - **Do:** A dedicated suite proving the money invariants: same key and same body replays the stored response; same key and different body returns `422`; an in-flight duplicate returns `409`; key retention outlives the longest replay path including a dead-letter replay a week later.
  - **Accept:** Every case passes; the key TTL is asserted against the documented longest retry chain, not a guess; a concurrent double-submit produces exactly one `payments` row.
  - **Verify:** The suite runs on every PR touching `payments`. Fresh-context adversarial review of the key-derivation logic before merge.
  - **Files:** `apps/api/test/payment-idempotency.integration.test.ts`
  - **Skills:** doubt-driven-development, api-and-interface-design, test-driven-development
- [ ] **T1.46 — Stripe Connect Express onboarding for drivers** · `M` · deps: T1.40, T0.37
  - **Do:** Generate a Connect Express onboarding link, store the connected account id, and track the account's capability status via webhook. Gate payouts on a fully-onboarded account.
  - **Accept:** A driver with an incomplete Connect account cannot be paid out and is told exactly what is missing; the onboarding return and refresh URLs are configured for both platforms; no bank detail passes through our servers.
  - **Verify:** Tests in Stripe test mode for the incomplete, restricted, and enabled account states, asserting the payout gate in each.
  - **Files:** `apps/api/src/payments/connect.controller.ts`, `apps/api/test/connect-onboarding.integration.test.ts`
  - **Skills:** security-and-hardening, source-driven-development
- [ ] **T1.47 — Monthly payout scheduler** · `M` · deps: T1.46
  - **Do:** A repeatable job on the 5th at 09:00 UTC. Aggregate the previous month's succeeded payments per driver, compute commission in integer cents, insert the `driver_payouts` row as `PROCESSING` *before* transferring, then transfer via Connect and reconcile to `PAID`. Isolate failures per driver. Per B3 (decided 2026-08-23) the basis is payments collected, not confirmed trips — no trip-level escrow.
  - **Accept:** Commission arithmetic is exact integer cents with a documented rounding direction and no floating point anywhere; a driver with zero earnings gets no payout row rather than a zero transfer; one driver's transfer failing does not abort the batch; re-running the job does not double-pay, guarded by a period-scoped unique constraint.
  - **Verify:** Tests for rounding at awkward amounts, a zero-earning driver, a mid-batch failure, a double run, and a partial-month subscription. A reconciliation test asserting the sum of net plus commission equals gross for every row.
  - **Files:** `apps/worker/src/payout.job.ts`, `apps/api/src/payments/commission.ts`, `apps/worker/test/payout.test.ts`
  - **Skills:** doubt-driven-development, test-driven-development
- [ ] **T1.48 — Earnings and payout history endpoints** · `S` · deps: T1.47
  - **Do:** `GET /drivers/me/earnings` for a period and a paginated `GET /drivers/me/payouts`, each returning gross, commission, and net in integer cents with the currency, plus a per-customer payment-status breakdown.
  - **Accept:** A driver sees only their own earnings; the breakdown shows which riders have paid without exposing the consumer's payment method; totals reconcile exactly against `payments` rows.
  - **Verify:** Tests for cross-driver rejection, pagination, and an arithmetic reconciliation against seeded payment rows.
  - **Files:** `apps/api/src/payments/earnings.controller.ts`, `apps/api/test/earnings.integration.test.ts`
  - **Skills:** api-and-interface-design, security-and-hardening

- [ ] **T1.49 — Receipts** · `S` · deps: T1.42
  - **Do:** Generate a receipt PDF into the private S3 bucket on a successful charge, email it, and serve it through a short-lived pre-signed URL from `GET /payments/:id/receipt`.
  - **Accept:** The receipt URL expires; a consumer cannot fetch another consumer's receipt; the PDF contains no card number beyond the last four digits; generation failure does not fail the charge.
  - **Verify:** Tests for URL expiry, cross-tenant rejection, and a generation failure leaving the payment `SUCCEEDED`.
  - **Files:** `apps/worker/src/receipt.job.ts`, `apps/api/src/payments/receipt.controller.ts`, `apps/api/test/receipt.integration.test.ts`
  - **Skills:** security-and-hardening, test-driven-development
- [ ] **T1.50 — Payment and earnings screens (mobile)** · `M` · deps: T1.41, T1.48, T0.32
  - **Do:** Consumer: add a card via the Stripe SDK sheet, list methods, view billing history, open a receipt, and handle a failed-payment banner with a fix action. Driver: current-month earnings, payout history, per-rider payment status, and Connect onboarding entry.
  - **Accept:** Every amount is formatted from integer cents with the currency and never shows a floating-point artefact; the failed-payment state is unmissable and actionable; the Connect onboarding hand-off returns cleanly to the app on both platforms; loading, empty, and error states everywhere.
  - **Verify:** Component tests for the money formatter across currencies and edge amounts, plus each state; a Detox flow adding a test card; accessibility pass.
  - **Files:** `apps/mobile-consumer/app/(app)/billing/*.tsx`, `apps/mobile-driver/app/(app)/earnings/*.tsx`, `packages/ui/src/format/money.test.ts`
  - **Skills:** frontend-ui-engineering, test-driven-development
- [ ] **T1.51 — Payment observability and alerting** · `S` · deps: T1.47
  - **Do:** RED metrics on every Stripe call. Alerts: payment failure rate above 3% in an hour (page), any failed payout job (page), billing job not completing by 10:00 (page), webhook processing lag (ticket). Each with a runbook link.
  - **Accept:** Every alert is symptom-based, has a threshold justified by the SLO or historical data, and links to a runbook; each was test-fired once by temporarily lowering the threshold; no alert pages on a cause metric like CPU.
  - **Verify:** Fire each alert once in staging and confirm it reaches the intended channel and the runbook link resolves.
  - **Files:** `apps/api/src/payments/metrics.ts`, `infra/monitors/payments.tf`, `docs/runbooks/payments.md`
  - **Skills:** observability-and-instrumentation

### ✅ Checkpoint 1-D — money is correct before anyone's card is real
- [ ] A charge succeeds end to end in test mode; a receipt is emailed and retrievable
- [ ] The idempotency suite is green, including the in-flight-duplicate and DLQ-retention cases
- [ ] Dunning walks the full timeline and pauses at the right point
- [ ] A 500-driver payout batch completes under 10 minutes with zero payment errors and exact reconciliation
- [ ] Doubt-driven review completed on idempotency-key derivation and payout arithmetic
- [ ] Every payment alert test-fired with a working runbook link

---

## Phase 1E — Messaging, Reviews, and Admin (realistic: 2–3 weeks)

- [ ] **T1.52 — In-app messaging** · `M` · deps: T1.16, T1.29
  - **Do:** Messages scoped to a subscription, delivered over the existing WebSocket with a push fallback, paginated history keyed on `(subscriptionId, sentAt DESC)`, read receipts, and a 90-day retention purge job. Sanitise the body: strip HTML, cap at 500 characters, store as plain text.
  - **Accept:** Only the two parties to a subscription can read or write that thread; a cancelled subscription's thread becomes read-only rather than disappearing; injected markup is stored inert and rendered as text; the purge job deletes at 91 days and not at 89.
  - **Verify:** Tests for third-party access rejection, an XSS payload round-tripping as inert text, pagination, and the purge boundary.
  - **Files:** `apps/api/src/messages/messages.controller.ts`, `apps/worker/src/message-purge.job.ts`, `apps/api/test/messages.integration.test.ts`
  - **Skills:** security-and-hardening, api-and-interface-design, test-driven-development
- [ ] **T1.53 — Chat screen with quick replies (mobile)** · `S` · deps: T1.52, T0.32
  - **Do:** A thread view for both apps with the preset quick messages from PRD F-09, unread badges, and an optimistic send with a failed-send retry affordance.
  - **Accept:** A failed send is visibly failed with a retry, never silently dropped; the read-only state on a cancelled subscription is explained; the input is accessible and the thread is screen-reader navigable.
  - **Verify:** Component tests for send, failed send, retry, and read-only; accessibility pass.
  - **Files:** `apps/mobile-*/app/(app)/chat/[subscriptionId].tsx`, `packages/ui/src/chat/*`
  - **Skills:** frontend-ui-engineering, test-driven-development
- [ ] **T1.54 — Ratings and reviews** · `M` · deps: T1.27
  - **Do:** `POST` a review after a completed subscription month, in both directions. Enforce the verified-only rule — the author must have or have had an active subscription — and the one-review-per-author-per-subscription constraint. Sanitise the comment to 500 plain-text characters.
  - **Accept:** A user with no subscription to the target cannot review; a second review by the same author on the same subscription returns `409`; a review submitted before a completed month is rejected; markup is stored inert; ratings are bounded 1–5 at the database level.
  - **Verify:** Tests for the unverified author, the duplicate, the too-early submission, the rating bounds, and an injection payload.
  - **Files:** `apps/api/src/reviews/reviews.controller.ts`, `apps/api/test/reviews.integration.test.ts`
  - **Skills:** security-and-hardening, test-driven-development

- [ ] **T1.55 — Rating aggregate cache feeding search rank** · `S` · deps: T1.54, T1.06
  - **Do:** Cache each driver's average rating and review count in Redis with a 1-hour TTL, invalidated on a new review. The matching service reads the aggregate rather than recomputing it per search.
  - **Accept:** A new review invalidates the cache immediately, so ranking reflects it on the next search; a cache miss falls back to a live query rather than a null rating; the aggregate excludes reviews on cancelled-before-start subscriptions if `T1.54` excludes them.
  - **Verify:** Tests for invalidation on write, cold-cache fallback, and a search ordering change after a new low rating.
  - **Files:** `apps/api/src/reviews/rating-cache.ts`, `apps/matching/app/matching/rating.py`, `apps/api/test/rating-cache.integration.test.ts`
  - **Skills:** performance-optimization, test-driven-development
- [ ] **T1.56 — Admin API: verification and suspension, with an audit trail** · `M` · deps: T0.38, T0.29
  - **Do:** `GET /admin/drivers/pending`, `POST /admin/drivers/:id/approve` (with tier), `POST /admin/drivers/:id/reject` (with reason), `POST /admin/users/:id/suspend`. Write an `audit_log` row for every admin action recording actor, entity, before, after, and IP. Approval flips the driver to `APPROVED` so they become searchable.
  - **Accept:** No admin action is possible without an `audit_log` row written in the same transaction; a non-admin role is rejected with `403`; rejection requires a non-empty reason; suspending a driver with active subscriptions triggers consumer notifications rather than silently stranding them.
  - **Verify:** Tests asserting the audit row for each action, the role rejection, the reason requirement, and the suspension notification fan-out.
  - **Files:** `apps/api/src/admin/drivers.controller.ts`, `apps/api/src/admin/audit.service.ts`, `apps/api/test/admin-drivers.integration.test.ts`
  - **Skills:** security-and-hardening, test-driven-development
- [ ] **T1.57 — Admin API: live trips, metrics, refunds, manual payout** · `M` · deps: T1.30, T1.47
  - **Do:** `GET /admin/trips/live` with current driver positions, `GET /admin/metrics` (MRR, active subscriptions, active drivers, DAU, failed payments, payout liability), `POST /admin/refunds`, and `POST /admin/payouts/trigger`. Metrics served from the read replica.
  - **Accept:** A refund is idempotent per payment and writes an audit row; the metrics query does not touch the primary; a manual payout trigger cannot double-pay a period already paid; live trips include only currently `IN_PROGRESS` trips.
  - **Verify:** Tests for refund idempotency, the double-payout guard, and an assertion that the metrics query targets the replica connection.
  - **Files:** `apps/api/src/admin/operations.controller.ts`, `apps/api/src/admin/metrics.service.ts`, `apps/api/test/admin-operations.integration.test.ts`
  - **Skills:** api-and-interface-design, security-and-hardening
- [ ] **T1.58 — Admin web: verification queue and document review** · `M` · deps: T1.56
  - **Do:** A Next.js panel authenticated separately from consumer JWTs. Pending-driver queue with a document viewer using short-lived pre-signed URLs, side-by-side profile data, and approve/reject with tier selection and a reason field.
  - **Accept:** Documents are never persisted to the browser's cache directory beyond the session; the reject flow requires a reason; the queue paginates; keyboard navigation covers the whole review flow; no document URL is shareable after expiry.
  - **Verify:** Chrome DevTools verification — zero console errors, no unexpected network calls, correct cache headers on document responses; axe-core clean; a manual check that an expired URL 403s.
  - **Files:** `apps/admin/app/drivers/page.tsx`, `apps/admin/app/drivers/[id]/page.tsx`, `apps/admin/components/DocumentViewer.tsx`
  - **Skills:** frontend-ui-engineering, browser-testing-with-devtools, security-and-hardening
- [ ] **T1.59 — Admin web: live map, metrics, refunds, audit log** · `M` · deps: T1.57, T1.58
  - **Do:** A live trips map with drill-down to a driver and a contact action, a metrics dashboard, a refund queue, and an audit-log viewer filterable by entity and actor.
  - **Accept:** The map degrades to a list when the WebSocket is unavailable rather than showing an empty map; every metric states its as-of time; the audit log is read-only in the UI with no delete path; axe-core clean.
  - **Verify:** DevTools console clean, network sane, Lighthouse accessibility ≥ 95; a manual check that the audit view exposes no mutation.
  - **Files:** `apps/admin/app/trips/page.tsx`, `apps/admin/app/metrics/page.tsx`, `apps/admin/app/audit/page.tsx`
  - **Skills:** frontend-ui-engineering, browser-testing-with-devtools, dataviz
- [ ] **T1.60 — Admin network isolation, proven** · `S` · deps: T1.59, T0.20
  - **Do:** Put the admin API and panel behind an internal ALB on a private subnet, reachable only via VPN or a bastion. Separate `ADMIN_API_KEY` in addition to the role check — two independent controls.
  - **Accept:** The admin API is unreachable from the public internet; the role check alone is not the only barrier; a leaked admin JWT is insufficient without network access.
  - **Verify:** From outside the VPC, attempt to reach every admin route and confirm connection failure, not `401`. Re-verify after any Terraform change touching the ALB. Include in the pre-launch checklist.
  - **Files:** `infra/terraform/admin-alb.tf`, `docs/runbooks/admin-access.md`, `tests/security/admin-isolation.sh`
  - **Skills:** security-and-hardening

### ✅ Checkpoint 1-E — MVP feature complete
- [ ] The full loop works on real devices: search → subscribe → accept → track → charge → payout → rate
- [ ] An admin can verify a driver, watch live trips, and issue a refund — every action audited
- [ ] Admin API proven unreachable from the public internet
- [ ] Every module's Definition of Done met; five-axis review completed on every merged change
- [ ] `code-simplification` pass over all of Phase 1; dead code identified and removed with approval

---

## Phase 1.5 — Hardening, Beta, and Launch (realistic: 6–8 weeks)

### 1.5a Privacy and security

- [ ] **T1.61 — Data export and hard deletion, end to end** · `M` · deps: T-D.08, Checkpoint 1-E
  - **Do:** Implement a data-subject export and a hard-delete path covering Postgres, S3 documents and photos, Redis, location logs, notification records, message history, and the log pipeline. Anonymise rather than delete only where a legal retention duty applies (payment records), and document exactly which fields those are.
  - **Accept:** After a delete request, no store returns the user's personal data — including caches, search-adjacent copies, and backups within the documented restore window; the response completes inside the promised 30 days; the deletion is audited; a deleted user's reviews are anonymised rather than removed if reviews are load-bearing for driver rank, and that choice is documented.
  - **Verify:** An automated test creating a full user with riders, subscriptions, trips, locations, messages, and documents, deleting them, then asserting across every store that nothing remains. Fresh-context adversarial review of the coverage — this is where "we forgot the analytics copy" happens.
  - **Files:** `apps/api/src/privacy/export.service.ts`, `apps/api/src/privacy/delete.service.ts`, `apps/api/test/privacy-deletion.integration.test.ts`, `docs/data-privacy-register.md`
  - **Skills:** security-and-hardening, doubt-driven-development, test-driven-development
- [ ] **T1.62 — Location-access audit** · `S` · deps: T1.31, T1.61
  - **Do:** Produce evidence for the PRD §13.3 promise that a consumer can see who has access to a rider's location. Enumerate every code path that can read a location and assert each is gated.
  - **Accept:** A written list of every read path with its guard; a consumer-facing screen or endpoint showing current accessors; no path reaches location data without a check.
  - **Verify:** A test that greps for direct `location_logs` and Redis ZSET reads outside the guarded service and fails if one exists.
  - **Files:** `docs/location-access-audit.md`, `apps/api/test/location-access-paths.test.ts`
  - **Skills:** security-and-hardening, doubt-driven-development
- [ ] **T1.63 — Full security review pass** · `M` · deps: T1.61
  - **Do:** Re-run the `T-D.09` threat model against the built system. Walk the complete `security-and-hardening` review checklist. Scan the entire git history for secrets and rotate anything found. Verify every "Never Do" item.
  - **Accept:** Every checklist line is checked with evidence, not asserted; any secret ever committed is rotated, not just removed; every endpoint has an authorisation test.
  - **Verify:** `gitleaks` or equivalent over full history returns clean; a coverage report proving every route has an authorisation test.
  - **Files:** `docs/security-review-mvp.md`
  - **Skills:** security-and-hardening, code-review-and-quality
- [ ] **T1.64 — Automated DAST against staging** · `S` · deps: T1.63
  - **Do:** Run OWASP ZAP in API-scan mode against the staging OpenAPI document. Triage every finding by reachability. Wire the scan into the pre-production pipeline.
  - **Accept:** Zero unmitigated high or critical findings; every accepted finding has a documented reason and a review date; the scan runs before each production deploy.
  - **Verify:** The report is committed; the pipeline blocks on a high finding.
  - **Files:** `.github/workflows/dast.yml`, `docs/security/zap-triage.md`
  - **Skills:** security-and-hardening, ci-cd-and-automation
- [ ] **T1.65 — Dependency and supply-chain hygiene** · `S` · deps: T1.63
  - **Do:** Confirm one authoritative lockfile per installation boundary and a frozen install in CI. Block dependency install scripts by default and approve only the minimum required, with the policy committed. Verify registry signatures and provenance where supported. Triage every audit finding by reachability. Add Dependabot with a small PR limit and a one-dependency-per-PR rule.
  - **Accept:** No competing lockfiles; no blanket script approval; every high or critical advisory is either fixed or documented as unreachable with a review date; the Python side is audited too, not just npm.
  - **Verify:** A clean frozen install from scratch; `pnpm audit signatures`; `pip-audit` on the matching service.
  - **Files:** `.npmrc`, `pnpm-workspace.yaml`, `.github/dependabot.yml`, `docs/security/dependency-policy.md`
  - **Skills:** security-and-hardening, code-review-and-quality
- [ ] **T1.66 — External penetration test and remediation** · `M` · deps: T1.64, T1.65
  - **Do:** Commission the pre-launch pen test PRD §13.3 requires. Scope it to include the mobile apps, the WebSocket layer, the payment flow, and the admin isolation. Remediate and retest.
  - **Accept:** Every high and critical finding is fixed and retested before launch; medium findings have owners and dates; the report is retained for the annual cycle.
  - **Verify:** A retest letter confirming remediation. **This is a hard launch gate — no exceptions.**
  - **Files:** `docs/security/pentest-<date>.md`
  - **Skills:** security-and-hardening, shipping-and-launch

### 1.5b Performance, accessibility, and observability

- [ ] **T1.67 — Complete k6 load-test suite** · `M` · deps: Checkpoint 1-E
  - **Do:** Implement the remaining four TRD §13.3 scenarios: search spike (200 rps for 60 s), acceptance burst (50 concurrent), payout batch (500 drivers), and the full-platform simulation (500 consumers + 50 drivers).
  - **Accept:** Search spike P99 under 500 ms with an error rate under 0.1%; the acceptance burst produces zero double-bookings and zero integrity errors; the payout batch completes under 10 minutes with zero payment errors; the full simulation meets every SLA with no out-of-memory event.
  - **Verify:** All five scenarios (with `T1.39`) pass against staging; results recorded in `PERF.md`; the suite is a documented pre-launch gate.
  - **Files:** `tests/load/{search_spike,acceptance_burst,payout_batch,full_platform}.js`, `PERF.md`
  - **Skills:** performance-optimization, ci-cd-and-automation
- [ ] **T1.68 — Measured performance pass** · `M` · deps: T1.67
  - **Do:** Only now, with baselines in hand, optimise. Audit every list query for N+1 patterns, confirm index usage with `EXPLAIN ANALYZE` on the ten hottest queries, and check cache hit rates against the TRD §13.2 table. Change one thing at a time and re-measure identically.
  - **Accept:** Every kept change beats run-to-run variance, not just the mean; every change that came out neutral or worse is **reverted**, not kept; every attempt including the reverted ones is logged in `PERF.md` so nobody re-runs a dead idea; correctness stays green — no win purchased by dropping needed work.
  - **Verify:** `PERF.md` shows a baseline, a result, and a verdict per attempt; the full test suite is green after the pass.
  - **Files:** `PERF.md`, targeted query and cache changes
  - **Skills:** performance-optimization, doubt-driven-development
- [ ] **T1.69 — Accessibility pass to WCAG 2.1 AA** · `M` · deps: Checkpoint 1-E
  - **Do:** Audit every mobile screen and admin page. Keyboard and switch-control navigation, screen-reader labels and reading order, contrast, focus management on sheets and modals, error-message association, and no colour-only state indication.
  - **Accept:** Every interactive element is reachable and operable without touch; every form error is announced and associated with its field; contrast meets 4.5:1 for body text and 3:1 for large text; axe-core and Lighthouse report zero accessibility violations; trip status is conveyed by text or icon, not colour alone.
  - **Verify:** axe-core clean on the admin panel; a manual VoiceOver and TalkBack pass over the four critical flows; Lighthouse accessibility ≥ 95; recorded in a checklist per screen.
  - **Files:** `docs/accessibility-audit.md`, targeted component fixes
  - **Skills:** frontend-ui-engineering, browser-testing-with-devtools
- [ ] **T1.70 — Alerting: all TRD §14.2 monitors, symptom-based** · `M` · deps: T1.51
  - **Do:** Implement every row of the TRD §14.2 table plus the driver-location-staleness monitor. Two severities only — page and ticket. Each alert gets a runbook of at least three lines: what it means, the first query to run, and the escalation path.
  - **Accept:** No alert pages on a cause metric while a user-facing symptom goes unmonitored; every threshold is justified by an SLO or by historical data, not a guess; every alert links to a runbook; no alert exists whose response would be "ignore it".
  - **Verify:** Each alert test-fired once by temporarily lowering its threshold, confirming both the channel and the runbook link. Recorded per alert.
  - **Files:** `infra/monitors/*.tf`, `docs/runbooks/*.md`
  - **Skills:** observability-and-instrumentation
- [ ] **T1.71 — Verify the telemetry itself** · `S` · deps: T1.70
  - **Do:** Induce failures in staging — a database connection drop, a Stripe timeout, a WebSocket mass-disconnect, a failing notification job — and diagnose each *using telemetry alone*, without reading source.
  - **Accept:** Each induced failure is located from logs, metrics, and traces alone; no log line renders as `[object Object]`; every new metric series appears with the expected bounded labels; one request is followable across all services with no broken span.
  - **Accept (negative):** If any failure cannot be diagnosed from telemetry, that is an instrumentation gap and a blocking task, not a note.
  - **Verify:** A written record per induced failure: what was broken, what telemetry revealed it, how long it took.
  - **Files:** `docs/observability-verification.md`
  - **Skills:** observability-and-instrumentation, debugging-and-error-recovery
- [ ] **T1.72 — Feature flags and kill switches** · `S` · deps: Checkpoint 1-E
  - **Do:** A flag per module — search, subscription creation, realtime tracking, billing, messaging, reviews — each with an owner and an expiry date. Test both flag states in CI. Document what degrades when each is off.
  - **Accept:** Turning off realtime tracking leaves the app usable with manual status updates rather than crashing; turning off billing suspends charging without cancelling subscriptions; no flag is nested inside another; both states pass CI.
  - **Verify:** A CI matrix running the critical-path tests with each flag off; a manual check of the degraded experience for each.
  - **Files:** `packages/config/src/flags.ts`, `.github/workflows/ci.yml`, `docs/feature-flags.md`
  - **Skills:** ci-cd-and-automation, shipping-and-launch
- [ ] **T1.73 — End-to-end Detox suite for the critical flows** · `M` · deps: Checkpoint 1-E
  - **Do:** Twelve flows on iOS and Android: register both roles, driver onboarding, add a rider, search, subscribe, accept, run a trip with pickup and dropoff, consumer tracking, add a card, view a receipt, leave a review, cancel a subscription.
  - **Accept:** All twelve pass on both platforms against a seeded staging backend; the suite is repeatable and not order-dependent; a flaky test is fixed, never retried into green.
  - **Verify:** Full suite green twice consecutively on both platforms; runs nightly with failures triaged the next morning.
  - **Files:** `apps/mobile-*/e2e/*.e2e.ts`, `.github/workflows/e2e-nightly.yml`
  - **Skills:** test-driven-development, ci-cd-and-automation

### 1.5c Beta, launch, and post-launch

- [ ] **T1.74 — Operational readiness: runbooks, on-call, incident protocol** · `M` · deps: T1.70
  - **Do:** Write the runbooks referenced by every alert. Define an on-call rota with an escalation path. Document the incident protocol including the breach-notification clock for a location-data exposure, the safety-incident protocol (immediate driver suspension pending investigation), and the PR crisis protocol PRD §18 requires before launch. Because B2 put in-app SOS out of MVP, this protocol plus a real, staffed emergency contact route **is** the launch safety control — write it as such.
  - **Accept:** Every alert has a reachable runbook; the safety protocol names who suspends a driver and within what time; the emergency escalation path a parent can actually reach is documented and staffed; the breach protocol names the notification deadline for the applicable regime; a person not on the build team could follow any of them.
  - **Verify:** A tabletop exercise on two scenarios — a safety incident and a suspected location-data exposure — walked start to finish.
  - **Files:** `docs/runbooks/*.md`, `docs/incident-response.md`, `docs/oncall.md`
  - **Skills:** shipping-and-launch, observability-and-instrumentation
- [ ] **T1.75 — Beta wave 1: internal and friendly** · `M` · deps: T1.72, T1.73, T1.74
  - **Do:** 5 drivers and 20 consumers in one corridor, with the team on-call. Collect structured feedback. Every bug gets a failing reproduction test before a fix (Prove-It).
  - **Accept:** No P1 defect open at the end of the wave; every fix has a regression test that failed before it; feedback is triaged into fix-now, fix-before-launch, and backlog.
  - **Verify:** A wave report: what broke, what was fixed, what was deferred and why. Reproduction tests all committed.
  - **Files:** `docs/beta/wave-1-report.md`, regression tests across modules
  - **Skills:** debugging-and-error-recovery, test-driven-development
- [ ] **T1.76 — Beta wave 2: closed beta at PRD scale** · `M` · deps: T1.75
  - **Do:** 20–50 drivers and 100–200 consumers per PRD §1.5. Watch the KPI instrumentation live. Confirm the driver-supply threshold answer to Q2 holds in practice before opening consumer signups.
  - **Accept:** On-time pickup rate, match-success rate, driver acceptance rate, and payment success rate are all measured against their PRD §17 targets — measured, not estimated; every gap has a named cause and an owner.
  - **Verify:** A KPI report comparing actual against target for every §17 metric, with an explicit go/no-go recommendation.
  - **Files:** `docs/beta/wave-2-report.md`
  - **Skills:** shipping-and-launch, observability-and-instrumentation
- [ ] **T1.77 — KPI dashboard** · `S` · deps: T1.76
  - **Do:** A dashboard covering the growth, quality, financial, safety, and engagement metrics from PRD §17, sourced from the read replica and the metrics backend.
  - **Accept:** On-time rate is computed automatically from actual versus agreed pickup times, not entered by hand; every panel states its as-of time and its definition; no panel needs a person to explain what it means.
  - **Verify:** Cross-check three metrics against a manual query and confirm they agree.
  - **Files:** `apps/admin/app/kpi/page.tsx`, `infra/monitors/kpi.tf`
  - **Skills:** observability-and-instrumentation, dataviz
- [ ] **T1.78 — App store readiness** · `M` · deps: T1.69, T1.73
  - **Do:** Privacy manifests and data-collection disclosures for both stores, a background-location permission justification (the most common rejection reason for this app class), screenshots and copy, the OTA update policy answering T-05, and a decision on Sign in with Apple given guideline 4.8 (see `plan.md` §10.2).
  - **Accept:** The data-collection disclosure matches the privacy register exactly — a mismatch is a rejection and a compliance problem; the background-location justification names the user benefit; the Apple sign-in question is resolved rather than discovered at review.
  - **Verify:** A pre-submission review against both stores' current guidelines; a TestFlight and internal-track build installed and exercised.
  - **Files:** `docs/store-submission.md`, `apps/mobile-*/app.config.ts`
  - **Skills:** shipping-and-launch, source-driven-development
- [ ] **T1.79 — Pre-launch checklist execution** · `M` · deps: T1.66, T1.67, T1.69, T1.70, T1.78
  - **Do:** Execute all six sections of the `shipping-and-launch` pre-launch checklist — code quality, security, performance, accessibility, infrastructure, documentation — with evidence per line, not a tick.
  - **Accept:** Every line is green with a link to its evidence; no TODO or `console.log` in production code; the pen-test retest letter is attached; the rollback plan is written with trigger conditions and time-to-recover per mechanism.
  - **Verify:** A signed go/no-go recorded in the launch document. A red line blocks launch; there is no override.
  - **Files:** `docs/launch/pre-launch-checklist.md`, `docs/launch/rollback-plan.md`
  - **Skills:** shipping-and-launch, code-review-and-quality
- [ ] **T1.80 — Staged rollout** · `M` · deps: T1.79
  - **Do:** Deploy to production with flags off, verify health, enable for the team for 24 hours, then canary at 5%, then 25%, 50%, and 100%, holding at each step for the monitoring window. Compare against baseline at every step using the `shipping-and-launch` advance/hold/roll-back thresholds.
  - **Accept:** No stage advances without its metrics inside the green band; error rate above 2× baseline or P95 above 1.5× baseline triggers an immediate roll back, not a discussion; every stage transition is logged with the numbers that justified it.
  - **Verify:** A rollout log recording the metrics at each gate and the decision taken.
  - **Files:** `docs/launch/rollout-log.md`
  - **Skills:** shipping-and-launch, ci-cd-and-automation
- [ ] **T1.81 — Post-launch verification and flag cleanup** · `S` · deps: T1.80
  - **Do:** The first-hour checks: health endpoint, error dashboard, latency dashboard, a manual walk of the critical flow, confirm logs are flowing, confirm the rollback path is ready. Monitor for a week. Then remove the fully-rolled-out flags and their dead code paths, and write the release changelog entry.
  - **Accept:** All six first-hour checks pass and are recorded; a week of monitoring with no unexplained anomaly; every 100%-rolled-out flag is removed within two weeks along with its dead branch; the release is tagged and the changelog entry is written for consumers, not from commit messages.
  - **Verify:** `git tag -a v1.0.0`; `CHANGELOG.md` entry grouped by Added/Changed/Fixed; a grep confirming no removed flag is still referenced.
  - **Files:** `docs/launch/post-launch-report.md`, `CHANGELOG.md`
  - **Skills:** shipping-and-launch, git-workflow-and-versioning, code-simplification

### ✅ Checkpoint 1.5 — public launch
- [ ] Pen test remediated and retested — hard gate
- [ ] All five load scenarios pass; WCAG 2.1 AA verified; every alert test-fired with a runbook
- [ ] Deletion and export proven across every store
- [ ] Beta KPIs measured against PRD §17 targets with a written go/no-go
- [ ] Staged rollout completed with metrics logged at every gate
- [ ] v1.0.0 tagged, changelog written, flags cleaned up

---

## Task count

Gate D 9 · Phase 0 44 · Phase 1A 13 · Phase 1B 11 · Phase 1C 15 · Phase 1D 12 · Phase 1E 9 ·
Phase 1.5 21 — **134 tasks**, none larger than `M`.
























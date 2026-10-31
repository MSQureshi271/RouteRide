# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

RouteRide is a recurring-transport subscription marketplace for school runs in Karachi, Pakistan. Parents subscribe to driver-operated routes; drivers set service areas, schedules and prices; the platform handles matching, payments and tracking. Currency is PKR stored as integer paisas; timezone is Asia/Karachi (UTC+5, no DST).

> `AGENTS.md` is the more detailed agent guide and `GEMINI.md` sets workflow preferences (below). Older docs (`README.md`, task prose, earlier versions of this file) contain stale versions/commands — **trust manifests, lockfiles, source and `.github/workflows/ci.yml`**.

## Workflow preferences (from GEMINI.md)

- **New features:** before implementing, you MUST first produce a completely thorough plan listing the changes needed to the existing codebase and architecture — especially for entirely new features or requests that could affect the codebase at a high level.
- **Reported errors:** do not jump straight to a fix. You MUST first explain what the error is (define it completely), what likely caused it, and then propose the solution for the user's approval path.
- **Planning inputs:** to plan, you MUST use the most relevant skills from `.agents/skills/` and the references in `.agents/references/` (quality bar: `.agents/references/definition-of-done.md`). Do this before planning, not after.
- **Up-to-date docs:** use the internet to look up the latest APIs, package versions and documentation so library usage is current and optimal. Before planning, you MUST use the relevant skills from `.agents/skills/` and `.agents/references/`.
- Check `tasks/todo.md` and the relevant `docs/SPEC-*.md` for acceptance criteria before starting. For matching/onboarding/subscription work, read `docs/decisions/ADR-011-service-area-discovery-and-driver-acceptance.md` and `tasks/PHASE1A-service-area-amendment.md` first — service-area availability is separate from recommendation ranking, and driver acceptance establishes commitments. The corridor baseline in `tasks/PHASE1A.md` is historical.

## Repository layout

pnpm workspaces + Turborepo (Node 22+, `pnpm@11.5.1`). Workspace package names are `@routeride/*`.

| Path                                         | What it is                                                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`                                   | NestJS 11 + Fastify REST API. Feature dirs sit directly under `src/` (`auth`, `consumers`, `drivers`, `search`, `subscriptions`, `maps`, `notifications`, `storage`, `common`, ...) — not `src/modules/` |
| `apps/worker`                                | BullMQ background jobs (NestJS)                                                                                                                                                                          |
| `apps/matching`                              | Python 3.12 FastAPI service: PostGIS discovery, Shapely, OR-Tools. **Not a pnpm package** — Turbo does not run its checks                                                                                |
| `apps/admin`                                 | Next.js 15 ops dashboard                                                                                                                                                                                 |
| `apps/mobile-consumer`, `apps/mobile-driver` | Separate Expo (~58) / React Native apps                                                                                                                                                                  |
| `packages/contracts`                         | Shared Zod 4 schemas and types (API ↔ mobile ↔ admin)                                                                                                                                                    |
| `packages/config`                            | Env validation (Zod 3, `src/env.ts`), logging, tracing                                                                                                                                                   |
| `packages/ui`                                | Shared RN components/forms/API helpers/stores; exports TS source directly (no build script)                                                                                                              |
| `infra`                                      | Terraform / ECS                                                                                                                                                                                          |

Module dependency graph and capability IDs: `docs/project-map.md`.

## Commands

Run from the repo root.

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres(PostGIS 16-3.4), Redis, LocalStack, Mailhog
pnpm install --frozen-lockfile
pnpm turbo lint typecheck test build             # required before committing
pnpm test:integration                            # needs dev/test stack + migrations (see ci.yml, docker-compose.test.yml)
```

Focused / single-test runs:

```bash
pnpm --filter @routeride/api dev
pnpm --filter @routeride/api test -- drivers/service-area.service.test.ts        # unit (jest, src/**)
pnpm --filter @routeride/api test:integration -- test/auth-otp.integration.test.ts  # integration (test/*.integration.test.ts)
pnpm --filter @routeride/admin dev
pnpm --filter @routeride/worker start:dev
pnpm --filter @routeride/mobile-consumer start    # likewise mobile-driver
pnpm --filter @routeride/ui typecheck
```

Turbo builds upstream packages before `typecheck`/`test`; when running a package directly, build `@routeride/contracts` and `@routeride/config` first. Lint uses `--max-warnings=0`.

Matching service (from `apps/matching`, venv active; create with `python -m venv .venv`):

```bash
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --port 8000
python -m ruff check . ; python -m mypy app ; python -m pytest   # pytest enforces 90% coverage, skips `perf` marker
python -m pytest tests/test_service_area_contracts.py -k <name>
```

## Database-backed tests (never skipped silently)

Some suites need a migrated PostGIS database whose **name contains `test`** (the guards refuse anything else, so a dev database is never touched). The dev Postgres container can host extra test databases; CI uses `routeride_test`.

- **API integration** (`apps/api/test/*.integration.test.ts`): run only via `test:integration` (the unit `jest.config.js` ignores them). Set `DATABASE_URL` to the test database first.
- **Matching** (`@pytest.mark.db`): set `MATCHING_TEST_DATABASE_URL`. Without it these tests **fail** with setup instructions; they do not skip. To run without a database, deselect them visibly: `pytest -m "not perf and not db"`. Plain `pytest` expects the database (CI runs the full set in the Integration job after migrations).

```bash
export DATABASE_URL=postgresql://<user>:<pw>@localhost:5432/routeride_<name>_test   # migrated
export MATCHING_TEST_DATABASE_URL="$DATABASE_URL"
pnpm --filter @routeride/api test:integration
cd apps/matching && python -m pytest
```

## Database workflow (Prisma 8 RC "contract" workflow)

- Source of truth is `apps/api/prisma/contract.prisma`; config in `apps/api/prisma.config.ts` (PostGIS extension); migrations in `apps/api/migrations/`. `prisma/schema.prisma` is the older schema with ADR-002 notes (geography columns are raw SQL; GIST/partial indexes live in the postgis migration).
- Generate client: `pnpm --filter @routeride/api prisma:emit` → `apps/api/src/generated/prisma` (never hand-edit).
- Plan/apply: `prisma:plan` (`prisma migration plan`), `prisma:migrate` (`prisma db migrate`). **Do not use `prisma migrate deploy`** (old instructions).
- Confirm the target DB before migrating or running `pnpm --filter @routeride/api seed`.

## Architecture notes

- API envelope: `{ data, meta: { requestId, timestamp } }` or `{ error: { code, message }, meta }`; request-ID handling lives in `apps/api/src/common`.
- Validate every external boundary with Zod (HTTP, env, WebSocket, external APIs); Python uses Pydantic v2 and `mypy --strict`, structlog only.
- Ownership/authorization is enforced in handlers/guards (e.g. `consumerId !== req.user.id` → `ForbiddenException`).
- Timestamps are `TIMESTAMPTZ` (UTC); schedules are `TIME` interpreted in the city timezone in application code.
- Commission rate comes from `platform_config` in the DB; other tunables come from `packages/config` / `docs/platform-parameters.md`. Never hardcode.
- Env vars: add to `.env.example` **and** the Zod schema in `packages/config/src/env.ts`.

## Rules

**Ask first:** schema changes; new dependencies; new secrets/env vars; auth/authorisation changes (JWT, role guards, ownership); Stripe/payment logic (idempotency + webhook signature patterns are load-bearing).

**Never:**

- Commit `.env*` (except `.env.example`), keys, or real credentials.
- Log PII, tokens, passwords, or coordinates above 2 dp (`round(lat, 2)`).
- Use `any` or blanket lint/TS suppressions without a specific justification in the same comment (`// eslint-disable-next-line @typescript-eslint/no-explicit-any — reason: ...`).
- Disable `strict`, `exactOptionalPropertyTypes`, or `noUncheckedIndexedAccess`.
- Skip/weaken tests or coverage thresholds to make CI green.
- Add `[PHASE 2]` endpoints/tables in Phase 0/1 work.

**Always:** write the failing test first; log with `requestId` on every API request; use Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`, `perf:`, `revert:`; enforced by commitlint + husky).

## Key documents

`tasks/plan.md` (decisions/risks), `tasks/todo.md` (tasks + acceptance criteria), `docs/SPEC-DELTA-mvp.md` (resolved scope conflicts), `docs/SPEC-*.md` (per module), `docs/decisions/ADR-*.md`, `docs/threat-model.md`, `docs/data-privacy-register.md`, `docs/regulatory-review.md`, `docs/runbooks/`, `DESIGN.md` (UI).

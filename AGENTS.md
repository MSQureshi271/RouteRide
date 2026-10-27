# RouteRide agent guide

> **Current architecture:** Read `docs/decisions/ADR-011-service-area-discovery-and-driver-acceptance.md` and `tasks/PHASE1A-service-area-amendment.md` before matching/onboarding/subscription work. Service-area availability is separate from recommendation ranking; driver acceptance establishes commitments. The corridor baseline in `tasks/PHASE1A.md` is historical, not current acceptance criteria.

## Working approach

- Before starting, read the relevant acceptance criteria in `tasks/todo.md`, the applicable phase plan (for example `tasks/PHASE1A.md`), and the relevant `docs/SPEC-*.md`. Load only the sections needed for the task.
- Preserve the workflow preferences in `GEMINI.md`: explain a feature's implementation plan and architectural impact before coding; for reported errors, explain the error, likely cause, and proposed solution before applying a fix.
- Use applicable workflows in `.agents/skills/` and checklists in `.agents/references/`. The shared quality bar is `.agents/references/definition-of-done.md`.
- Inspect existing code, related tests, and shared types before editing. Keep changes scoped and preserve unrelated working-tree changes.
- Use manifests, lockfiles, source, and CI for current commands and dependency versions. `CLAUDE.md`, `README.md`, and older task prose contain historical versions, paths, and commands; verify them before use. Consult official documentation for the installed version when implementing library integrations.

## Project and layout

RouteRide is a recurring-transport subscription marketplace for school runs and commutes, launching in Karachi, Pakistan.

| Location                                     | Responsibility                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api`                                   | NestJS with Fastify REST API; feature directories live directly under `src/`, including `auth`, `consumers`, `drivers`, and `search` |
| `apps/worker`                                | Background jobs using NestJS and BullMQ                                                                                              |
| `apps/matching`                              | Python FastAPI route matching with PostGIS queries, Shapely, and OR-Tools                                                            |
| `apps/admin`                                 | Next.js operations dashboard                                                                                                         |
| `apps/mobile-consumer`, `apps/mobile-driver` | Separate Expo / React Native applications                                                                                            |
| `packages/contracts`                         | Shared Zod contracts and TypeScript types                                                                                            |
| `packages/config`                            | Environment validation, logging, and tracing                                                                                         |
| `packages/ui`                                | Shared React Native components, forms, API helpers, and stores; exports TypeScript source directly                                   |
| `infra`                                      | Terraform and ECS configuration                                                                                                      |
| `docs`, `tasks`                              | Specifications, ADRs, runbooks, plans, and acceptance criteria                                                                       |

The JavaScript workspace uses pnpm and Turborepo. Use Node 22+ and the root `packageManager` pin (`pnpm@11.5.1`). Python requires 3.12+. PostgreSQL/PostGIS and Redis provide local persistence and queues. Check each package manifest for framework versions rather than assuming the versions in older documentation.

## Commands

Run these from the repository root unless stated otherwise:

```powershell
pnpm install --frozen-lockfile
docker compose -f docker-compose.dev.yml up -d
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Integration tests require configured PostgreSQL/PostGIS and Redis, migrations, and test environment variables; see `.github/workflows/ci.yml` and `docker-compose.test.yml`. Use a dedicated test database. Review `.env.example` and `packages/config/src/env.ts` for configuration requirements; do not overwrite an existing `.env`.

Use full workspace package names for focused commands:

```powershell
pnpm --filter @routeride/api dev
pnpm --filter @routeride/admin dev
pnpm --filter @routeride/worker start:dev
pnpm --filter @routeride/mobile-consumer start
pnpm --filter @routeride/mobile-driver start
pnpm --filter @routeride/contracts build
pnpm --filter @routeride/config build
pnpm --filter @routeride/api test
pnpm --filter @routeride/ui typecheck
```

Turborepo builds upstream packages for `typecheck` and `test`; direct package commands may need shared packages built first. `packages/ui` and the mobile apps have no `build` script.

The matching service is a separate Python project, **not** a pnpm package; root Turbo checks do not run its checks. From `apps/matching`, with a Python virtual environment active:

```powershell
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --port 8000
python -m ruff check .
python -m mypy app
python -m pytest
```

On Windows, create the environment with `python -m venv .venv` and activate it with `.\.venv\Scripts\Activate.ps1`. Pytest enforces 90% coverage and excludes `perf` tests by default; see `apps/matching/pyproject.toml` for configuration.

## Database workflow

- This repository uses the Prisma 8 prerelease contract workflow. Read `apps/api/prisma.config.ts`, `apps/api/prisma/contract.prisma`, and `apps/api/migrations/` before database work.
- Generate the client with `pnpm --filter @routeride/api prisma:emit`; generated output is `apps/api/src/generated/prisma`. Do not hand-edit generated code.
- The current scripts are `prisma:plan` (`prisma migration plan`) and `prisma:migrate` (`prisma db migrate`). Do not copy older `prisma migrate deploy` instructions from `CLAUDE.md`.
- Inspect migration checks and preview commands in `.github/workflows/ci.yml`; confirm the target database before applying migrations or running `pnpm --filter @routeride/api seed`.

## Conventions and boundaries

- Keep TypeScript strictness enabled, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. Avoid `any` and blanket lint/type suppressions; document narrowly justified exceptions.
- Validate external TypeScript boundaries with Zod and Python request/response models with Pydantic. Reuse contracts from `packages/contracts` and configuration from `packages/config`.
- Follow the existing API response/error envelope and request-ID handling in `apps/api/src/common`. Enforce authorization and ownership at the appropriate boundary.
- Represent money as integer paisas (`1 PKR = 100 paisas`). Store timestamps in UTC using `TIMESTAMPTZ`; interpret schedule times in the configured city timezone (`Asia/Karachi` at launch).
- Read configurable business values from their established configuration source. Commission comes from database `platform_config`; consult `docs/platform-parameters.md` instead of hardcoding values.
- Python code uses type annotations, strict mypy, and structlog. Never log secrets, tokens, passwords, names, addresses, phone numbers, or precise coordinates; round logged coordinates to at most two decimal places.
- Never commit `.env` files, private keys, or real credentials. `.env.example` must contain placeholders only.
- Existing project guidance calls for approval for schema changes, new dependencies, new secrets/environment variables, authentication/authorization changes, and payment changes. Honor authorization already given for the task; otherwise explain the concrete change before requesting approval. Update the environment schema and example when adding configuration.
- Keep work within the requested phase and scope; do not add planned Phase 2 features incidentally.

## Verification and reference material

- For behavior changes, add focused regression tests and verify they detect the bug or missing behavior. Do not skip tests or weaken coverage thresholds to make checks pass.
- Run checks appropriate to the changed packages, plus Python checks when matching code changes. Before committing code, run `pnpm turbo lint typecheck test build` and relevant integration tests. Report failures and any checks that could not run.
- For documentation-only changes, verify referenced paths and commands and check formatting; application test suites are not necessary.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, etc.).
- Consult `docs/SPEC-DELTA-mvp.md` for resolved scope questions, `docs/decisions/` for architectural decisions, and `docs/threat-model.md` / `docs/data-privacy-register.md` for security and privacy requirements. Use `DESIGN.md` for UI work and `docs/runbooks/` for operations.

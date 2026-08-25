# RouteRide — Agent Context File

> This file is the first thing an AI session reads. It answers: what is this project, how do I work in it, what do I never do, and what commands do I run?

---

## What This Is

RouteRide is a **recurring-transport subscription marketplace** for school transportation in Karachi, Pakistan. Parents subscribe to driver-operated school runs; drivers set fixed routes, schedules, and prices; the platform handles matching, payments, and real-time tracking.

**Tech stack (pinned versions):**

| Layer | Technology | Version |
|-------|-----------|---------|
| API | NestJS + Fastify adapter | 10 |
| Database | PostgreSQL + PostGIS | 16 + 3.4 |
| ORM | Prisma | 5 |
| Realtime | Socket.IO + Redis adapter | 4 |
| Queue | BullMQ | 5 |
| Matching service | Python + FastAPI | 3.12 + 0.115 |
| Solver | OR-Tools | 9.12 |
| Mobile | Expo SDK | 53 |
| Admin panel | Next.js | 15 |
| Shared contracts | Zod | 3 |
| Package manager | pnpm workspaces | 11.5 |
| Build system | Turborepo | 2 |
| Node | Node.js | 22 LTS |
| Currency | PKR (integer paisas) | — |
| Timezone | Asia/Karachi (UTC+5, no DST) | — |

---

## Commands

Every command below runs from the **repo root** and has been verified from a clean clone.

### Day-to-day

```bash
# Start the full dev stack (Postgres, Redis, LocalStack, Mailhog)
docker compose -f docker-compose.dev.yml up -d

# Install all dependencies (after clone or after package.json changes)
pnpm install

# Run all linters across the monorepo
pnpm turbo lint

# Type-check all TypeScript packages
pnpm turbo typecheck

# Run all unit tests
pnpm turbo test

# Run all integration tests (requires dev stack running)
pnpm turbo test:integration

# Build all packages
pnpm turbo build
```

### API service (apps/api)

```bash
# Dev server with hot reload
pnpm --filter api dev

# Run Prisma migrations (from empty DB)
pnpm --filter api exec prisma migrate deploy

# Run Prisma Studio (DB GUI)
pnpm --filter api exec prisma studio

# Seed the database with fixture data
pnpm --filter api seed
```

### Matching service (apps/matching)

```bash
# Python venv setup (first time)
cd apps/matching && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Dev server
uvicorn app.main:app --reload --port 8000

# Lint
ruff check .

# Type check
mypy app

# Tests
pytest
```

### Mobile apps

```bash
# Consumer app
pnpm --filter mobile-consumer start

# Driver app
pnpm --filter mobile-driver start
```

### Packages

```bash
# Build shared contracts package
pnpm --filter contracts build

# Build shared config package
pnpm --filter config build
```

---

## Code Conventions

### TypeScript (all Node packages)

- **Strict mode, always.** `tsconfig.base.json` sets `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`. Do not disable these.
- **Zod for validation.** Every external boundary (HTTP input, env vars, WebSocket payloads, external API responses) validates with a Zod schema. Never trust unvalidated input.
- **Money as integer paisas.** `DRIVER_PRICE_MIN_CENTS` is in paisas (×100 of PKR). Never use `float` for money. `1 PKR = 100 paisas`.
- **Timestamps as `TIMESTAMPTZ`.** All DB timestamps in UTC. Schedules stored as `TIME` with the city timezone applied in application code.
- **Conventional commits.** `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`, `perf:`, `revert:`.
- **Error envelope.** Every API response uses `{ data, meta: { requestId, timestamp } }` or `{ error: { code, message }, meta }`. Never return raw errors.

**Example — Zod-validated NestJS handler:**
```typescript
// ✅ Correct — validates at boundary, enforces ownership
@Post(':id/riders')
@UseGuards(JwtGuard, RoleGuard('CONSUMER'))
async addRider(
  @Param('id', ParseUUIDPipe) consumerId: string,
  @Body(new ZodValidationPipe(AddRiderSchema)) dto: AddRiderDto,
  @Req() req: AuthenticatedRequest,
): Promise<ApiResponse<Rider>> {
  if (consumerId !== req.user.id) throw new ForbiddenException();
  return this.consumerService.addRider(consumerId, dto);
}
```

### Python (apps/matching)

- **Type annotations on everything.** `mypy --strict` must pass.
- **Pydantic v2 for models.** All request/response models use `pydantic.BaseModel` with validation.
- **structlog for logging.** No `print()` or `logging` in application code.
- **Coordinates rounded to 2 dp before logging.** `round(lat, 2)` — never log full precision.

---

## Always / Ask-first / Never

### Always

- Run `pnpm turbo lint typecheck test build` before committing.
- Write the failing test before writing the implementation.
- Validate with Zod at every external boundary.
- Log with `requestId` on every API request.
- Check `tasks/todo.md` before starting any task — the task defines the acceptance criteria.

### Ask first (do not proceed without human approval)

- **Schema changes** — adding or dropping columns, changing types, or adding constraints.
- **New external dependencies** — every new package must have a stated purpose and a bundle/audit check.
- **New secrets or environment variables** — add to `.env.example` and the Zod schema in `packages/config/src/env.ts`.
- **Changing authentication or authorisation logic** — any change to JWT validation, role guards, or ownership checks.
- **Stripe or payment logic changes** — the idempotency and webhook signature patterns are load-bearing.

### Never

- Commit `.env`, `*.pem`, `*.key`, or any file matching `.env.*` except `.env.example`.
- Commit a real Stripe key, AWS key, JWT secret, or webhook secret to version control.
- Disable a lint rule or TypeScript error with a blanket ignore comment without a specific justification in the same comment.
- Use `any` in TypeScript without a `// eslint-disable-next-line @typescript-eslint/no-explicit-any — reason:` comment.
- Log PII (names, addresses, phone numbers), tokens, passwords, or coordinates at precision greater than 2 decimal places.
- Skip a test to make CI green.
- Add a `[PHASE 2]` endpoint or table in Phase 0 or Phase 1 work.
- Hardcode the platform commission rate — it must always come from `platform_config` in the database.
- Hardcode any value from `docs/platform-parameters.md` — all configurable values come from `packages/config`.

---

## Architecture Quick Reference

See `docs/project-map.md` for the full module dependency graph.

| Module | Location | Depends on |
|--------|----------|-----------|
| identity (auth) | `apps/api/src/modules/identity` | `packages/config`, `packages/contracts` |
| driver-onboarding | `apps/api/src/modules/driver-onboarding` | identity |
| consumer-riders | `apps/api/src/modules/consumer-riders` | identity |
| route-matching | `apps/matching/` | identity |
| subscriptions | `apps/api/src/modules/subscriptions` | route-matching |
| trips | `apps/api/src/modules/trips` | subscriptions |
| payments | `apps/api/src/modules/payments` | subscriptions |
| realtime-tracking | `apps/api/src/modules/realtime` | trips |
| notifications | `apps/api/src/modules/notifications` | identity |
| messaging | `apps/api/src/modules/messaging` | identity |
| reviews | `apps/api/src/modules/reviews` | trips |
| admin-panel | `apps/admin/` | all modules |
| mobile-shell (consumer) | `apps/mobile-consumer/` | `packages/ui`, `packages/contracts` |
| mobile-shell (driver) | `apps/mobile-driver/` | `packages/ui`, `packages/contracts` |

---

## Key Documents

| Document | Purpose |
|----------|---------|
| `tasks/plan.md` | Architecture decisions, risk table, open questions |
| `tasks/todo.md` | Source of truth for all tasks and their acceptance criteria |
| `docs/SPEC-DELTA-mvp.md` | Resolved scope conflicts (B1–B5) |
| `docs/platform-parameters.md` | All configurable business logic values |
| `docs/threat-model.md` | STRIDE threat model per trust boundary |
| `docs/data-privacy-register.md` | PII classification and retention |
| `docs/regulatory-review.md` | Legal and compliance framework |
| `docs/decisions/ADR-*.md` | Architecture Decision Records |

---

## Signals That a Session Is Going Wrong

- You are writing code without a matching task in `tasks/todo.md`.
- You are making a schema change without asking first.
- You are adding a dependency without a stated reason.
- You are using `any` without a comment explaining why.
- The test you are writing does not fail before the implementation.
- You are logging a coordinate with more than 2 decimal places.
- You are hardcoding the commission rate.

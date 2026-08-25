# RouteRide — Project Map

> Load this document at the start of any session to understand which module to focus on. Use the capability-map IDs to load only the modules relevant to your current task.

---

## Module Dependency Graph

```
                        platform-foundation
                     (packages/config + contracts)
                                │
                            identity
                         (apps/api/identity)
                         ┌──────┴──────┐
                         ▼             ▼
              driver-onboarding   consumer-riders
                         │             │
                         └──────┬──────┘
                                ▼
                         route-matching
                        (apps/matching/)
                                │
                         subscriptions
                        (apps/api/subscriptions)
                    ┌───────────┼────────────┬───────────┐
                    ▼           ▼            ▼           ▼
                  trips      payments    messaging    reviews
                    │
             realtime-tracking
            (apps/api/realtime)
                    │
               admin-panel
               (apps/admin/)
```

**Parallel tracks** (can be built simultaneously once `platform-foundation` and `identity` exist):
- `mobile-shell` (consumer + driver) — `apps/mobile-consumer/`, `apps/mobile-driver/`
- `notifications` — `apps/api/notifications/`

---

## Module Quick Reference

| Module ID | Location | Phase | Key Tasks |
|-----------|----------|-------|-----------|
| `platform-foundation` | `packages/`, root config | 0 | T0.01–T0.18 |
| `identity` | `apps/api/src/modules/identity` | 0.3 | T0.19–T0.31 |
| `driver-onboarding` | `apps/api/src/modules/driver-onboarding` | 0.4 | T0.32–T0.39 |
| `consumer-riders` | `apps/api/src/modules/consumer-riders` | 0.5 | T0.40–T0.47 |
| `mobile-shell` | `apps/mobile-consumer/`, `apps/mobile-driver/` | 0.6 | T0.48–T0.57 |
| `notifications` | `apps/api/src/modules/notifications` | 0.7 | T0.58–T0.65 |
| `route-matching` | `apps/matching/` | 1A | T1.01–T1.12 |
| `subscriptions` | `apps/api/src/modules/subscriptions` | 1B | T1.13–T1.22 |
| `trips` | `apps/api/src/modules/trips` | 1C | T1.23–T1.35 |
| `realtime-tracking` | `apps/api/src/modules/realtime` | 1C | T1.29–T1.35 |
| `payments` | `apps/api/src/modules/payments` | 1D | T1.36–T1.52 |
| `messaging` | `apps/api/src/modules/messaging` | 1E | T1.52–T1.54 |
| `reviews` | `apps/api/src/modules/reviews` | 1E | T1.54–T1.55 |
| `admin-panel` | `apps/admin/` | 1F | T1.56–T1.62 |

---

## Key Files Per Module

### platform-foundation

| File | Purpose |
|------|---------|
| `packages/config/src/env.ts` | Zod env validation — call `loadEnv()` at process start |
| `packages/config/src/logger.ts` | Pino logger factory with redaction |
| `packages/config/src/tracing.ts` | OTel SDK initialisation |
| `packages/contracts/src/index.ts` | All Zod schemas and TypeScript types |
| `packages/contracts/openapi.json` | Generated OpenAPI 3.1 document |
| `.github/workflows/ci.yml` | Quality-gate CI pipeline |
| `docker-compose.dev.yml` | Local dev stack |
| `apps/api/prisma/schema.prisma` | Prisma schema v1 |
| `apps/api/prisma/migrations/` | SQL migrations including PostGIS DDL |

### identity

| File | Purpose |
|------|---------|
| `apps/api/src/modules/identity/auth.controller.ts` | Auth endpoints |
| `apps/api/src/modules/identity/jwt.strategy.ts` | JWT validation |
| `apps/api/src/modules/identity/roles.guard.ts` | RBAC role guard |
| `apps/api/src/modules/identity/auth.service.ts` | Business logic |

### route-matching

| File | Purpose |
|------|---------|
| `apps/matching/app/main.py` | FastAPI entrypoint |
| `apps/matching/app/routers/search.py` | Search endpoint |
| `apps/matching/app/services/matcher.py` | OR-Tools solver |
| `apps/matching/app/services/geometry.py` | Shapely / PostGIS geometry |

---

## Context Loading Guide

When starting a session for a specific module, load these files in order:

1. `CLAUDE.md` — tech stack, commands, boundaries
2. `tasks/todo.md` — current task and acceptance criteria (search for the task ID)
3. `docs/SPEC-<module-id>.md` — module spec
4. `tasks/plan.md` §10 — known spec gaps relevant to this module
5. `docs/threat-model.md` §B<n> — threat boundary for this module
6. Files listed in the task's "Files:" field

---

## Critical Invariants (Do Not Break)

| Invariant | Where enforced |
|-----------|---------------|
| No driver visible in search until manually approved | `identity` roles + `driver-onboarding` status check |
| All money stored as integer paisas | Prisma schema (`INTEGER` columns), `packages/contracts` |
| No stack trace in API error responses | Global exception filter (`T0.15`) |
| Live location data purged after 30 days | Cron job (`T1.32`) |
| Stripe webhook signature verified before processing | Webhook handler (`T1.43`) |
| Conflict lock: `SERIALIZABLE` + `FOR UPDATE` on seat | `T1.16` |
| Commission rate read from `platform_config` dynamically | Payout service (`T1.47`) |
| CORS wildcard blocked in production | `packages/config/src/env.ts` |
| Coordinates logged at max 2 dp | Pino redaction + Python `round(lat, 2)` |

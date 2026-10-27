# Phase 1A service-area amendment: implementation report

Date: 2026-10-21. Governing decision: [ADR-011](../docs/decisions/ADR-011-service-area-discovery-and-driver-acceptance.md). Requirements: [amendment plan](PHASE1A-service-area-amendment.md).

## Result and limits

Implemented service-area settings, optional established routes, v2 discovery, complete ranked pagination, truthful nullable route distances, recurring-run schema, and read-only road-time insertion evaluation. Driver onboarding/settings and the existing consumer results screen consume the new contracts. Pending-request creation, driver acceptance transactions, notifications/outbox and the full public driver profile remain Phase 1B / T1.13 work; the consumer review modal does not send or confirm a request.

Existing uncommitted work was retained. PostGIS verification used `routeride_amendment_20261021_test`, with isolated schemas/temporary tables and cleanup of fixtures. On 2026-10-21, the full app migration chain was also applied to the development database `routeride_dev`; its final contract and live schema now verify successfully. No live Google Routes requests were made.

## Task status

| Task  | Implementation and evidence                                                                                                                                                                                                                                                                                             | Remaining gate                                                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1.01 | Shared TypeScript/Python contracts and versioned fixture parity; explicit route state, polygon/availability limits, nullable distances, pagination, requested legs, proposal versions and DECLINED outcome.                                                                                                             | Update published OpenAPI alongside Phase 1B endpoint delivery.                                                                                                                                      |
| A1.02 | Additive SQL, native Prisma wrapper/snapshot, conservative legacy backfill, deferred stop-order constraints, read-only grants and operational rollback. Six real PostGIS rehearsal cases pass; clean rehearsal and `routeride_dev` migration replays verify against their final contracts. | Legacy runs with incomplete stop/time evidence remain flagged for review.                                                                                   |
| A1.03 | Authenticated driver coverage GET/PUT; PostGIS topology/boundary validation; route-free onboarding; stable-row serialization; coverage and window edits preserve ACTIVE/PAUSED commitments. Additive legacy setup allowed only when it preserves route, endpoints and slots. Four real settings integration cases pass. | Legacy commitments lacking trustworthy locations/slots need explicit operational review, never fabricated setup.                                                                                    |
| A1.04 | Driver editor collects explicit area corners, private start and separate day/leg windows. Retains an existing arbitrary polygon and route until explicitly replaced. Component/model/onboarding tests pass.                                                                                                             | Real Android/iOS visual and interaction verification.                                                                                                                                               |
| A1.05 | Read-only `/internal/v2/matching/search` uses both-endpoint inclusive coverage, approval and explicit availability. No corridor-distance/direction veto. PostGIS boundary, route-free, distant route and offered-return tests pass.                                                                                     | Deploy only after schema prerequisites and coordinated API/Python rollout.                                                                                                                          |
| A1.06 | Conservative per-run/day/leg capacity, independent return occupancy, and shared-run timing evaluator. Legacy unknown runs use aggregate conservative occupancy rather than independent false free seats.                                                                                                                | Acceptance must lock/recheck the same snapshots in Phase 1B.                                                                                                                                        |
| A1.07 | Preserved component weights, neutral route-free proximity, private run-aware timing, stable tie-break and complete pagination. Property tests preserve candidates regardless of input order/distance.                                                                                                                   | Mobile device verification is shared with A1.04.                                                                                                                                                    |
| A1.08 | Public gateway uses v2, verifies rider ownership before cache, whitelists fields, invalidates by roster/availability revision and coordinated policy version, and enforces deadline. Consumer input/results updated to v2.                                                                                              | Any old external client expecting v1 public fields needs coordinated release.                                                                                                                       |
| A1.09 | Validated road evidence, explicit policy, bounded Google Routes adapter, malformed/partial/provider-failure tests. Existing httpx moved from dev extras to runtime. Disabled by default.                                                                                                                                | Verify enabled provider access and operating buffers before Phase 1B acceptance is enabled; batch matrices exceeding 25 distinct points.                                                            |
| A1.10 | Read-only bounded insertion preserves stop precedence, pickup/dropoff windows, first-pickup reachability, transfers, capacity and both legs. Missing/stale evidence cannot approve.                                                                                                                                     | Phase 1B T1.15/T1.16 must assemble snapshots and bind proposals to request/roster/availability/estimate versions.                                                                                   |
| A1.11 | Terminal-outcome statistics exclude pending/withdrawn requests; historical acceptance requires commitment evidence. Departure observations use confirmed runs. Display cache is explicitly non-authoritative. Separate discovery/feasibility telemetry avoids treating low fit as exclusion.                            | Production metric export/operational monitoring verification during rollout.                                                                                                                        |
| A1.12 | Local integration/property/coverage checks and mixed 500-driver PostGIS/ranking benchmark executed. Clean rehearsal and development-database migration chains now verify against their final contracts.                                                                                                                        | CI on supported runtime versions, real-device checks and staged rollout remain outstanding.                                                                                                           |

## Verification

- Workspace `pnpm turbo lint typecheck build`: **21 tasks passed** across all eight packages (including cache hits). The existing Next.js ESLint-plugin advisory remains non-fatal.

- Matching full suite: **229 passed**, three performance tests separately deselected by the existing default marker rule. The dedicated PostGIS test ran successfully; it was not skipped. Overall branch-enabled coverage **97.56%**; strict mypy passed for 24 source files. Ruff passed after organizing the new test imports.
- Contracts: **59 tests passed**; lint/typecheck/build passed. New service-area contract module has 100% statement/branch coverage.
- API amendment/regression checks: **76 tests passed** across eight affected unit/mocked-integration suites, plus **10 real PostGIS cases** across migration/settings suites. This is focused coverage, not a claim that the full API test inventory was executed.
- Mobile consumer: **38 tests passed**, 86.04% lines / 72.56% branches. Mobile driver: **40 tests passed**, 88.61% lines / 80.16% branches. Both apps passed lint/typecheck. No browser/DevTools connector or device emulator was available for visual verification.
- Worker: **40 tests passed**, 94.63% lines / 85.29% branches; lint/typecheck/build passed.
- Config: **18 tests passed**, plus typecheck/lint/build. Environment defaults remain placeholders and the new road provider is opt-in.
- Prisma contract emission passed. Native metadata and contract snapshots were reconstructed for the four historical SQL migrations; `prisma migration check` now passes with no failures. The schedule-slot contract now uses SQL `TIME`, and the declared GiST indexes are represented in the contract. A clean replay of the full chain remains outstanding; do not treat integrity validation alone as deployment rehearsal.
- Local runtime: Windows, Node 24, Python 3.14.4, PostgreSQL/PostGIS container. CI's Node 22 / Python 3.12 run remains required.

## Performance

The isolated PostGIS benchmark seeded 500 approved drivers (250 without routes and 250 with established routes), explicit outbound/return availability, 250 confirmed morning runs, 500 active assignments and 500 reviews. It measured 100 requests after ten warmups, requesting both legs and the first ranked page.

**Matching processing including SQL and ranking: P50 32.578 ms, P99 64.472 ms.** Both satisfy the plan's P50 <120 ms / P99 <400 ms targets for this local fixture. A contended run during simultaneous workspace checks measured 133.258/255.612 ms; it is retained as a reminder that these are local measurements, not production load or capacity guarantees. This benchmark excludes HTTP gateway/network and external road-time requests. See [PERF.md](../PERF.md).

## Edited files

This list identifies files edited for this amendment, including files that already contained uncommitted work. It does not attribute all existing working-tree differences to this task.

### Contracts and configuration

- `packages/contracts/src/modules/service-area.ts`
- `packages/contracts/src/modules/subscriptions.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/service-area.test.ts`
- `packages/contracts/test-vectors/service-area-v2.json`
- `packages/config/src/env.ts`
- `packages/config/src/env.test.ts`
- `.env.example`

### Database

- `apps/api/prisma/contract.prisma`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/provision-ro-user.ts` (additional read-only grants; provisioning itself not executed)
- `apps/api/prisma/contract.prisma` (schedule-slot `TIME` fields and GiST index declarations)
- `apps/api/migrations/app/20261006T1500_matching_foundation/{migration.sql,migration.ts,migration.json,ops.json}`
- `apps/api/migrations/app/20261006T1900_schedule_slots_time_type/{migration.sql,migration.ts,migration.json,ops.json}`
- `apps/api/migrations/app/20261007T1400_driver_acceptance_stats/{migration.sql,migration.ts,migration.json,ops.json}`
- `apps/api/migrations/app/20261008T1500_driver_profiles_gist_index/{migration.sql,migration.ts,migration.json,ops.json}`
- `apps/api/migrations/app/20261021T0458_service_area_runs/migration.sql`
- `apps/api/migrations/app/20261021T0458_service_area_runs/rollback.sql`
- `apps/api/migrations/app/20261021T0458_service_area_runs/migration.ts`
- `apps/api/migrations/app/20261021T0458_service_area_runs/migration.json`
- `apps/api/migrations/app/20261021T0458_service_area_runs/ops.json`
- `apps/api/migrations/snapshots/88ac2242793e95380c6c883b3a193d8df418825bb74de7d29c1cf4fe52513101/{contract.json,contract.d.ts}`
- `apps/api/migrations/snapshots/09fd6c5776fd4aa1b2f52943f6f129c3d37c791e07729bc2767d28dd5f6367c1/{contract.json,contract.d.ts}`
- `apps/api/migrations/snapshots/675e2b128cc03bd0b1f6c69571326ba231fa3555992fd3008d18761891048d56/{contract.json,contract.d.ts}`
- `apps/api/migrations/snapshots/b5c89f72e7d1e455f059cc746d1d7517ea4fa89c6b8d47246d3eb69ec7b5913f/{contract.json,contract.d.ts}`
- `apps/api/migrations/snapshots/89abcac3ba2225484761b39a51eed191db4b581ca06f411414774f1e2ba39dbc/{contract.json,contract.d.ts}`
- `apps/api/src/generated/prisma/contract.json` (generated)
- `apps/api/src/generated/prisma/contract.d.ts` (generated)

### API

- `apps/api/src/drivers/drivers.module.ts`
- `apps/api/src/drivers/drivers.service.ts`
- `apps/api/src/drivers/service-area.controller.ts`
- `apps/api/src/drivers/service-area.service.ts`
- `apps/api/src/drivers/service-area.service.test.ts`
- `apps/api/src/drivers/profile-mutation.ts`
- `apps/api/src/drivers/profile-mutation.test.ts`
- `apps/api/src/search/search.controller.ts`
- `apps/api/src/search/search.service.ts`
- `apps/api/src/search/matching.client.ts`
- `apps/api/src/search/discovery.service.test.ts`
- `apps/api/test/driver-onboarding-status.integration.test.ts`
- `apps/api/test/driver-pricing.integration.test.ts`
- `apps/api/test/driver-route.integration.test.ts`
- `apps/api/test/search.integration.test.ts`
- `apps/api/test/matching-client.integration.test.ts`
- `apps/api/test/service-area-migration.integration.test.ts`
- `apps/api/test/service-area-settings.integration.test.ts`

### Matching service

- `apps/matching/app/config.py`
- `apps/matching/app/main.py`
- `apps/matching/app/maps/road_times.py`
- `apps/matching/app/maps/google_road_times.py`
- `apps/matching/app/matching/discovery.py`
- `apps/matching/app/matching/feasibility.py`
- `apps/matching/app/matching/observability.py`
- `apps/matching/app/schemas/discovery.py`
- `apps/matching/app/schemas/service_area.py`
- `apps/matching/pyproject.toml`
- `apps/matching/tests/test_discovery_v2.py`
- `apps/matching/tests/test_discovery_postgis.py`
- `apps/matching/tests/test_feasibility_v2.py`
- `apps/matching/tests/test_google_road_times.py`
- `apps/matching/tests/test_service_area_contracts.py`
- `apps/matching/tests/test_service_area_metrics.py`
- `apps/matching/tests/perf/test_discovery_ranking_latency.py`
- `apps/matching/tests/perf/test_discovery_postgis_latency.py`

### Mobile apps

- `apps/mobile-driver/src/service-area/model.ts`
- `apps/mobile-driver/src/service-area/ServiceAreaEditor.tsx`
- `apps/mobile-driver/app/(app)/service-area.tsx`
- `apps/mobile-driver/app/(app)/_layout.tsx`
- `apps/mobile-driver/app/(app)/route-settings.tsx`
- `apps/mobile-driver/app/(onboarding)/step4-availability.tsx`
- `apps/mobile-driver/__tests__/service-area-model.test.ts`
- `apps/mobile-driver/__tests__/service-area-editor.test.tsx`
- `apps/mobile-driver/__tests__/onboarding.test.tsx`
- `apps/mobile-consumer/app/(app)/search/index.tsx`
- `apps/mobile-consumer/app/(app)/search/results.tsx`
- `apps/mobile-consumer/__tests__/search-results.test.tsx`

### Worker

- `apps/worker/src/driver-stats/driver-stats.job.ts`
- `apps/worker/src/driver-stats/driver-stats.worker.ts`
- `apps/worker/src/duration-cache/duration-cache.job.ts`
- `apps/worker/src/duration-cache/duration-cache.worker.ts`
- `apps/worker/test/driver-stats.test.ts`
- `apps/worker/test/duration-cache.test.ts`

### Progress and operational documentation

- `tasks/PHASE1A-service-area-amendment.md`
- `tasks/PHASE1A-amendment-progress.md`
- `tasks/PHASE1A.md`
- `tasks/todo.md`
- `docs/decisions/ADR-011-service-area-discovery-and-driver-acceptance.md`
- `docs/platform-parameters.md`
- `PERF.md`

## Next steps in order

1. **Complete:** the full migration chain was replayed on `routeride_migration_rehearsal_fix2_20261021` and applied to `routeride_dev`; both verify against their final contracts. The rehearsal matching role can SELECT but cannot INSERT. Do not reuse `routeride_migration_rehearsal_20261021` as a clean replay target; stepwise diagnosis left it at the `b5c89f7` contract.
2. Run CI on Node 22/Python 3.12 and verify both mobile flows on real Android/iOS devices. Review driver-declared polygons/start locations and flagged legacy run assignments; unresolved historical commitments cannot be silently rewritten.
3. Finish T1.12/T1.13 delivery: the existing results screen now browses v2 candidates, but the public driver profile and actual Send request action await the following endpoint work. Keep review copy explicit until requests can be sent.
4. Implement Phase 1B T1.14-T1.24 using the new contracts/evaluator: pending requests, read-only previews, versioned authoritative acceptance, expiry/withdrawal, outbox notifications, cancellation and concurrency proof. No acceptance without fresh road evidence or both round-trip legs.
5. Validate Google Routes access and configured buffers/freshness, batch larger matrices, and execute the full device loop before enabling acceptance. Coordinate schema, Python v2, gateway and mobile rollout; bump `MATCHING_CONFIG_VERSION` together when changing discovery rules or scoring configuration.

## Migration replay repair (2026-10-21)

The initial `prisma db migrate` error (`Cannot read properties of undefined (reading 'length')`) came from the hand-authored `rawSql` wrappers omitting `precheck` and `postcheck` arrays. Prisma’s migration checker did not catch that omission, but the apply runner assumed both arrays existed. Explicit empty arrays were added to the four older wrappers, and the amendment wrapper retains its real precheck and postcheck.

The first successful apply then exposed contract drift that preview could not detect. The matching-foundation SQL now matches its intermediate snapshot, including the expected stats index and timestamp type, and retains the legacy schedule-slot uniqueness until the final snapshot transition. The service-area migration now performs that transition to per-leg uniqueness and includes the missing indexes, foreign keys, and named enum checks required by the final contract. Migration artifacts were regenerated through each migration’s `MigrationCLI` self-emission command.

Validation passed:

- `prisma migration check`: all checks passed.
- Full `prisma db migrate --yes` replay: 7 migrations applied across the app and PostGIS spaces.
- `prisma db verify`: database marker and live schema match contract `89abcac3…`.
- `prisma migration status`: up to date.
- Matching role: `NOLOGIN`, SELECT allowed, INSERT denied.

The verified database is `routeride_migration_rehearsal_fix2_20261021`. The earlier rehearsal database has the first six migrations applied and is not a clean replay target.

## Existing database type alignment (2026-10-21)

The development database already stored matching-stat operating days as `smallint`, departure-of-day observations as `TIME`, and schedule legs as the native `ScheduleLegType` enum. The Prisma 8 contract and amendment were updated to preserve those representations. `driver_matching_stats.typical_departure_time` contained 3,003 populated `TIME` values; none were converted. The alignment migration rejects non-null timestamp values rather than inventing a date/timezone conversion, and validates that operating days are within `0..6` and enum labels match the contract.

Validation on `routeride_dev` passed:

- `prisma migration check`: all checks passed.
- `prisma db migrate --db <routeride_dev> --yes`: six app migrations applied; PostGIS was already installed.
- `prisma migration status`: up to date at contract `dd72d3ff…`.
- `prisma db verify`: marker and live schema match the revised contract.
- API typecheck and `src/search/discovery.service.test.ts`: passed (6 tests).
- The discovery cache revision query now reads `availability_version` and `roster_version` successfully.

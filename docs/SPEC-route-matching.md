# SPEC: route-matching

> **Module ID:** `route-matching`
> **Status:** Revised specification; implementation amendments pending.
> **Capability map:** `tasks/plan.md` section 3.
> **Scope delta:** [B6](SPEC-DELTA-mvp.md), [ADR-011](decisions/ADR-011-service-area-discovery-and-driver-acceptance.md).
> **Canonical rules/tasks:** [Phase 1A amendment](../tasks/PHASE1A-service-area-amendment.md).

## 1. Objective

Discover available drivers whose declared service areas cover both commute endpoints, and rank them by commute fit. Consumers can request any available candidate, including one with no established route or a lower recommendation score. Separately, provide read-only run-insertion proposals so drivers can review requests and the API can enforce capacity and committed pickup/dropoff windows at acceptance.

Search is advisory, not a reservation or a promise of arrival feasibility. Recommendation ranking never activates a subscription.

## 2. Commands

From `apps/matching`, with the Python environment active:

```bash
python -m pytest
python -m ruff check .
python -m mypy app
python -m uvicorn app.main:app --reload --port 8000
```

Gateway verification from repository root:

```bash
pnpm --filter @routeride/contracts build
pnpm --filter @routeride/api test
pnpm --filter @routeride/api test:integration
```

## 3. Structure and Contracts

- `apps/matching/app/matching/`: existing candidates, direction, capacity, timing and scoring; amended by A1.05-A1.07.
- `apps/matching/app/schemas/`: Python request/response validation.
- `apps/matching/app/maps/`: travel estimates; A1.09 defines freshness and failure policy.
- `apps/api/src/search/`: authenticated gateway, ownership and cache orchestration.
- `packages/contracts/src/modules/search.ts`: discovery contracts; planned fields include route state, nullable distances, review status and pagination.
- `packages/contracts/test-vectors/`: versioned discovery, ranking and acceptance-feasibility fixtures.
- New insertion/optimization modules and proposal schemas are defined in A1.09/A1.10; they are not assumed to exist today.

Consumer commute shape is `ONE_WAY` or `ROUND_TRIP`. Every search has a `departureTime`; a round trip additionally has a later `pickupTime`. Those names identify the consumer's requested schedule, not fixed times of day. Request legs use `DEPARTURE` and, for round trips, `PICKUP`. Driver availability uses recurring day/time intervals without leg labels, and each requested segment must fit an offered interval.

The public endpoint remains `GET /drivers/search`. Version the changed internal contract; existing `/internal/v1/matching/search` is the corridor baseline. Public responses exclude internal scores, acceptance counts, other riders' stops, driver private starting location and full private roster geometry.

## 4. Rules

### Candidate availability

- Require approved status, willingness to receive requests, both endpoints inside the declared service area and platform launch bounds, offered days/time intervals and compatible capacity.
- Intentional absence of an established route is valid. Invalid established geometry remains a data-quality failure; never implicitly convert it into route-free eligibility.
- Proximity informs ranking, not hard request thresholds. Both round-trip segments must independently fit declared availability and pass feasibility checks.
- Known impossible timing excludes a candidate. Uncalculated detailed feasibility yields review-required status, not a claim of confirmed feasibility.

### Distance and ranking

- Display estimated shortest geographic distance in metres from requested pickup to the relevant route; destination distance may also be shown. This is not actual road detour, travel time, live-driver distance or a walking instruction.
- With no established route, return null and explicit copy; never synthesize zero distance.
- Preserve initial weights: proximity 0.40, timing 0.25, rating 0.20, capacity 0.10, acceptance 0.05. Apply the amendment's neutral proximity fallback for route-free drivers and retain Bayesian priors and stable driver-ID tie-breaking. Fixtures must prove the fallback does not imply a measured geographic match.
- Old corridor radii normalize scores only. Drivers beyond them remain requestable if otherwise available in their declared area.
- Provide complete bounded pagination, not a top-N list that makes other available drivers inaccessible.

### Shared-run feasibility

- Read recurring assignments and ordered pickup/dropoff stops. Compatible shared riders are not conflicts merely because windows overlap.
- Check capacity independently per day/leg using conservative seats-per-run accounting. Check pickup-before-dropoff, all committed windows/deadlines, travel to first pickup and transfers between separate runs.
- Route-free drivers declare starting location/availability for first-pickup evaluation. Both round-trip legs must pass; cross-midnight service remains unsupported.
- Use timestamped/versioned road-time estimates and configured service times/buffers. Haversine alone is not acceptance evidence. Missing/stale inputs yield unavailable, not feasible.
- Return proposal and roster/availability/policy/estimate versions. Identical snapshots yield identical decisions; acceptance must revalidate stale proposals.
- Timeout/no solution cannot use an existing stop order unless insertion of the new rider is independently feasible.

### Runtime boundaries

Python remains read-only; API owns subscription/run mutations. Grant SELECT only on required new availability/run tables. No external Maps calls during discovery; proposals are calculated outside API write transactions. Preserve strict typing, Pydantic validation, redacted structured logs, disabled search retries and bounded deadlines. Version/invalidate caches on policy, coverage and roster changes.

## 5. Tests and Success Criteria

- Route-free, valid established route, corrupt route, area boundary, out-of-area endpoint, explicit return availability, and greater-distance selectable candidates.
- Shared-run capacity, separate day/leg rosters, first pickup reachability, impossible transfers, arrival deadlines and no-solution insertion.
- Null distances, complete pagination, no private stop leakage, requestability independent of score, and shared Python/TypeScript predicate fixtures.
- Stale proposals/caches, unavailable provider, expired estimates and read-only database access.
- Mixed-population benchmark at 500 drivers: matching P50 <120ms/P99 <400ms processing time; record a new baseline in `PERF.md`. Keep >=90% line and >=85% branch coverage. Old corridor numbers do not prove new performance.

## 6. Boundaries

Includes recommendation and recurring-run insertion feasibility. Excludes automatic acceptance, bidding, live traffic rerouting and on-demand ride hailing. Phase 1A alone does not ship Phase 1B request/acceptance mutations or screens.

# SPEC: subscriptions

> **Module ID:** `subscriptions`
> **Status:** Revised specification; implementation pending.
> **Capability map:** `tasks/plan.md` section 3.
> **Scope delta:** [B6](SPEC-DELTA-mvp.md), [ADR-011](decisions/ADR-011-service-area-discovery-and-driver-acceptance.md).
> **Tasks:** T1.14-T1.24 in `tasks/todo.md`, with A1.01/A1.02/A1.08/A1.10 prerequisites from the [Phase 1A amendment](../tasks/PHASE1A-service-area-amendment.md).

## 1. Objective and Lifecycle

Consumers send recurring transportation requests to any available driver covering their commute. Drivers review locations, requested schedule and run impact, then accept or decline. Only successful acceptance establishes a subscription and capacity commitment. The first request may establish a driver's initial recurring run.

| From      | Action                             | To          | Capacity effect                           |
| --------- | ---------------------------------- | ----------- | ----------------------------------------- |
| None      | Consumer sends request             | `PENDING`   | None                                      |
| `PENDING` | Owning driver accepts after checks | `ACTIVE`    | Allocate each affected day/leg atomically |
| `PENDING` | Owning driver declines             | `DECLINED`  | None                                      |
| `PENDING` | 24-hour deadline passes            | `EXPIRED`   | None                                      |
| `PENDING` | Owning consumer withdraws          | `CANCELLED` | None                                      |
| `ACTIVE`  | Cancellation becomes effective     | `CANCELLED` | Release assignments on effective date     |

`DECLINED` is included in the shared status contract. No separate persisted `REQUESTED` or `ACCEPTED` states. `SUBSCRIPTION_ACCEPTED` names an activation event. Pausing remains Phase 2; pending requests create neither trips nor billing obligations.

## 2. Commands and Structure

From repository root, once the corresponding implementation exists:

```bash
pnpm --filter @routeride/contracts build
pnpm --filter @routeride/api test -- subscriptions
pnpm --filter @routeride/api test:integration -- subscription
pnpm --filter @routeride/api typecheck
```

Planned handlers live in `apps/api/src/subscriptions/`. Shared DTOs live in `packages/contracts/src/modules/subscriptions.ts`; A1.02 supplies run schema/assignments. Worker jobs handle expiry, effective cancellation and outbox delivery. These handlers are planned, not claimed to be implemented.

## 3. Request and Preview Rules

- A request is `ONE_WAY` or `ROUND_TRIP`. The first segment is `DEPARTURE`; a round trip has a later `PICKUP` segment. Search and request payloads use `departureTime` and optional `pickupTime`; day-based driver availability is expressed as time intervals without leg labels.

- `POST /subscriptions` checks consumer/rider ownership, approval/requestability, both endpoints inside coverage, offered schedule and known capacity/feasibility. Do not require a recommendation score or old corridor-radius test.
- Atomically claim Idempotency-Key and body hash. Same key/body replays, changed body returns 422, in-flight duplicate returns 409. Distinct pending requests may coexist without reserving capacity; enforce duplicate-intent and rate limits.
- Snapshot endpoints, days/legs, pickup/dropoff windows, start date, price and deadline. Acceptance cannot silently change the requested terms.
- Preview is read-only: nullable route distance, first-run or existing-run insertion, added travel/time, stops and committed-window impact. Return feasible/infeasible/unavailable, reasons and versions. Same snapshot agrees with acceptance; later changes can cause rejection.
- Only the addressed driver may inspect the request and their relevant roster. Discovery never exposes another rider's precise stops.

## 4. Atomic Acceptance

1. Authorize owning driver and require an unexpired `PENDING` request.
2. Calculate a versioned proposal outside the write transaction. Unknown/stale road-time evidence cannot authorize acceptance.
3. In `SERIALIZABLE`, lock stable driver and rider commitment rows in consistent order. Schedule-row locks alone cannot protect an empty roster.
4. Revalidate deadline/state, approval, coverage/availability, proposal/policy/estimate versions, capacity and committed pickup/dropoff windows. Prevent incompatible concurrent rider commitments across drivers.
5. Atomically persist `ACTIVE`, run assignments, stop order, derived slots, version changes and outbox events. Notify after commit.

Retry only SQLSTATE `40001`, up to three retries after the initial attempt with jittered exponential backoff. Business failures are immediate. Stale/concurrent conflicts return `409 RACE_CONFLICT` with safe actionable reasons; missing estimates yield a retryable feasibility-unavailable outcome. No external routing calls while locks are held.

Subscription terms plus recurring run assignments and stop order are authoritative; schedule slots/display geometry are derived and reconstructible. This revises ADR-009's subscription-only reconstruction assumption.

Shared riders may have overlapping windows. Capacity is conservative per-run occupancy, separately on each day and committed segment; within-run seat reuse is deferred. Separate runs require transfer travel time. Round-trip acceptance commits both segments or neither.

## 5. Terminal Outcomes and Cancellation

- Expiry, withdrawal and acceptance compete atomically; exactly one transition wins. Sanitize decline reasons. Acceptance statistics count accepted, declined and expired requests once, excluding pending/withdrawn requests.
- Preserve existing active-service minimum commitment/notice policy. Release seats and rebuild assignments only on the effective cancellation date. Pending withdrawal is immediate and unbilled.
- Invalidate affected run versions, derived slots, previews and search caches on effective roster changes. Removing the last rider does not expand service coverage or delete trip history.
- Persist lifecycle outbox events with state changes; deduplicate delivery. Crash recovery cannot lose a committed event or publish a rolled-back transition. Apply existing notification privacy rules.
- Payment cadence, refunds and active cancellation billing remain governed by existing specs; this amendment does not redesign payments.

## 6. Verification and Success Criteria

- Multiple pending requests for one free seat are allowed; 50 concurrent acceptances allocate exactly one seat.
- Serialize empty-roster first acceptances; accept compatible shared riders within capacity, reject impossible commitments.
- Prevent incompatible commitments for one rider across concurrently accepting drivers.
- Derived assignments match active commitments by day/leg; do not assert slot count equals subscription count.
- Same-snapshot preview parity, stale roster/availability, expired estimates and passed request deadlines.
- First pickup reachability, dropoff deadlines, inter-run transfers, timeout and unknown evidence.
- Effective cancellation, immediate pending withdrawal, ownership isolation, idempotency replay and outbox rollback/recovery.
- Real-device route-free discovery -> request -> first acceptance -> second compatible rider -> updated run, without consumer-side activation.

## 7. Boundaries

Monthly recurring service only. No automatic acceptance, bidding, new billing policy, or in-progress rerouting. Implement through the amended tasks with schema/contract migration and regression evidence before rollout.

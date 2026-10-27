# Phase 1A amendment: service-area discovery and request feasibility

**Authority:** [ADR-011](../docs/decisions/ADR-011-service-area-discovery-and-driver-acceptance.md), approved product direction on 2026-10-21.
**Status:** Implementation and local verification in progress. See [implementation report](PHASE1A-amendment-progress.md) for edited files, evidence, remaining migration-chain/device checks and next steps. The original completed tasks remain historical in `PHASE1A.md` and `todo.md`.

## Canonical product flow

Consumer enters a rider's pickup, destination, operating days, leg(s), times and start date -> recommended drivers -> browse all available candidates -> send a request -> driver reviews route/schedule impact -> decline or accept -> atomic activation and route update -> notify both parties.

Search and pending requests reserve no seats. A consumer chooses whom to request, never directly activates a subscription. Recommendation distance is measured from the requested pickup, not the phone's live location.

## Replacement architecture rules

### Discovery, recommendation, and acceptance

| Stage          | Rules                                                                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery      | Approved and accepting requests; endpoints inside platform service bounds; if a driver has declared a service area, both endpoints must be covered; all requested days and legs offered; declared time availability and capacity compatible. Exclude known infeasible candidates. Distinguish unknown detailed feasibility from confirmed availability. |
| Recommendation | Rank available drivers by commute fit. Corridor distance and direction are useful signals, not hard vetoes. A consumer can paginate through all available drivers and request any of them.                                                                                                                                     |
| Request        | Validate ownership, requested terms, driver approval, platform bounds, any declared service-area coverage, availability and duplicate/idempotency rules. Recheck known capacity/feasibility; no seat or slot allocation. Unknown detailed feasibility requires review, never a promise. |
| Preview        | Read-only proposal for the first run or insertion into an existing run: stops, pickup/dropoff windows, added distance/time, capacity, and before/after schedule. Return feasible, infeasible, or unavailable with reasons and proposal versions.                                                                               |
| Acceptance     | Only the owning driver can activate an unexpired pending request. Fresh authoritative checks of every affected day, leg, seat and committed window; atomically update subscriptions, runs, stops and derived slots. Unknown or stale feasibility cannot be accepted.                                                           |

Do not run the old E1-E7 pipeline unchanged at all three stages. Share predicates and fixtures where rules are common; recommendation is not a hard constraint. A stale preview may differ from acceptance; identical snapshots and inputs must yield identical decisions.

### Service area and availability

- Consumers declare a commute as `ONE_WAY` or `ROUND_TRIP`. The first requested segment is `DEPARTURE`; round trips add a later `PICKUP` segment. Search uses `departureTime` and optional `pickupTime` and validates them against driver availability.
- Driver availability is one or more non-overlapping recurring time intervals per operating day. It is independent of segment names; do not ask drivers to configure separate morning and afternoon windows. Preserve disjoint legacy availability windows during migration.
- A driver service area is required and stored as validated WGS84 area geometry. Include polygon boundaries in coverage checks and require both pickup and destination inside it. Platform operating bounds still apply.
- Collect offered days and availability windows separately from the route. Round-trip service is explicit, never inferred from a polyline.
- A driver without a route must declare a starting location and availability sufficient to evaluate reaching the first pickup. They do not need a personal service-area polygon; driver acceptance remains the final commitment gate. Do not use an undisclosed live location or an invented route as a substitute.
- When a driver has declared a service area, membership is necessary but insufficient for timing feasibility. Acceptance accounts for road travel from the driver's declared start/prior commitment and between stops, service time, and configured buffers.
- Driver changes to area, availability, capacity, or route must preserve existing commitments or use an explicit resolution/cancellation flow. Never silently remove riders.

### Recurring runs and feasibility

- Introduce recurring run assignments and ordered pickup/dropoff stops. A subscription references its run per offered leg; a round trip has outbound and return assignments.
- Capacity is checked independently for every affected operating day and committed segment. For the MVP use conservative seats-per-run accounting (one rider per seat for the run); do not combine distinct `DEPARTURE`/`PICKUP` rosters into one occupancy count. Seat reuse within a run is deferred.
- Overlapping rider windows within a feasible shared run are allowed. Separate run windows must include travel between the last stop and the next run's first stop.
- Preserve pickup-before-dropoff ordering and committed arrival deadlines as well as pickup windows. An optimizer cannot accept a shorter route that violates a promise.
- Keep cross-midnight service unsupported and existing round-trip temporal validation. No partial round-trip activation.
- Road-time estimates are versioned and timestamped. Configure maximum age, travel buffer and stop-service duration before enabling acceptance. On missing/expired estimates or no valid insertion, acceptance fails safely. An existing stop order is a fallback only if insertion of the new rider is independently proven feasible.
- Search stays fast and read-only, without synchronous external Maps calls. Detailed proposal calculation may be slower and has a separate bounded timeout. Deterministic Haversine may support search/display; it is not authoritative arrival proof.
- Compute proposals outside transactions, then lock the driver profile and revalidate versions and constraints during acceptance. Serialize the first two acceptances even when no run/slot rows exist. Three retries maximum after the initial transaction on `40001`; exhausted retries return `409 RACE_CONFLICT`.
- Prevent two active subscriptions for the same rider covering an incompatible recurring service period, including concurrent acceptance by different drivers. Validate/lock the rider commitment as well as driver capacity in a consistent order.

### Contracts, ranking and presentation

- Search remains `GET /drivers/search`; version the changed internal contract rather than silently changing v1. Planned response fields distinguish route state, nullable pickup/destination route distance in metres, availability/review status and stable pagination.
- Existing-route distance is the shortest geographic point-to-LineString distance, labelled as an estimate. It is not driving detour, ETA, or guaranteed walking distance. Route-free distance is null, not zero or infinity. Invalid established geometry is a data-quality problem, not route-free eligibility.
- Retain ratings, review counts, capacity and price presentation. Keep internal scoring and acceptance statistics private. No other rider's precise stop coordinates or full roster geometry in consumer results.
- Preserve the established five-component weights initially. Use a neutral proximity contribution for genuinely route-free drivers, with explicit "No established route" copy; test this fallback before rollout. Route distance outside old radii lowers fit but cannot remove a candidate. Retain stable driver-ID tie-breaking. Recommendation labels must not claim a route-free driver is geographically closest.
- Timing and capacity scores become run-aware. Neutral priors remain for drivers without history. Refresh acceptance statistics from terminal request outcomes, not search impressions or pending requests.
- Define recommendation ordering and complete paginated browsing together; top-N recommendation truncation must not make lower-ranked available drivers inaccessible. Cache keys include commute inputs, matching policy version, and availability/roster revisions or invalidation; never share rider-private data in public cache entries.
- State model: `PENDING -> ACTIVE` only on acceptance; `PENDING -> DECLINED`, `EXPIRED`, or `CANCELLED` for manual rejection, deadline, or consumer withdrawal. `DECLINED` is a planned contract/schema addition. No separate `REQUESTED` or `ACCEPTED` persisted state. Active cancellation retains its existing notice policy; pending withdrawal is immediate and never billed.
- Preserve the existing 24-hour response deadline. Request expiry and acceptance race atomically. Notifications occur after commit and are deduplicated.

## Amendment tasks

These stable IDs avoid the existing T1.14 collision. Each task is a focused increment; split further if its implementation exceeds five files. Exact new filenames are established at the contract/schema step. Do not mark these complete based on the old corridor implementation. Previous Phase 1A/1B duration estimates are obsolete; re-estimate after A1.01/A1.02 define the migration and contracts.

| ID    | Deliverable and acceptance criteria                                                                                                                          | Verification                                                                                                       | Likely files / dependencies                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| A1.01 | Specify coverage, route states, availability and request/preview DTOs; fixtures cover null distance, both legs and lifecycle outcomes.                       | Zod/Python contract fixture parity, reject malformed area/time input.                                              | `packages/contracts/src/modules/{drivers,search,subscriptions}.ts`, shared fixtures; ADR-011 |
| A1.02 | Add service-area/availability/run/stop schema and constraints; preserve existing subscriptions; explicitly classify legacy drivers requiring coverage setup. | Forward/backfill/rollback rehearsal on fixture DB; no lost commitments or invented coverage.                       | API contract, versioned migration, integration test; A1.01                                   |
| A1.03 | Allow verified onboarding without a route or personal service-area polygon, with start location and availability; reject invalid established route data.        | Onboard both driver types and exercise optional-area edits with commitments.                                       | API drivers service/contracts/tests; A1.02                                                   |
| A1.04 | Driver UI collects availability and starting location; a declared area remains supported but is not required.                                                 | Component and device flow for both modes and platform-boundary errors.                                             | Driver onboarding/route settings screens/tests; A1.03                                        |
| A1.05 | Candidate retrieval honors declared coverage when present and platform bounds plus availability otherwise; distance/direction thresholds never veto requests.  | Boundary, optional-area, route-free, suspended-driver and reverse-corridor fixtures.                                | Matching candidates/schema/tests; A1.03                                                      |
| A1.06 | Implement recurring-run capacity and commitment predicates, with independent days/legs and shared-window compatibility.                                      | Shared run succeeds; full run, impossible transfer and unavailable return fail.                                    | Matching capacity/timing/tests/shared vectors; A1.02                                         |
| A1.07 | Rank both driver types, expose honest nullable distances and complete stable browsing.                                                                       | Fixed ranking fixtures, no duplicate/missing pages, distant available driver remains reachable.                    | Matching scoring/engine/tests; A1.05, A1.06                                                  |
| A1.08 | Wire versioned gateway responses, ownership, requestability, cache versioning and invalidation.                                                              | Contract parity, stale roster/area cache tests, private data exclusion.                                            | API search service/client/integration tests; A1.07                                           |
| A1.09 | Build versioned road-time input adapter and operational buffer policy for preview; external calls remain outside transactions/search.                        | Missing, stale, timeout and provider-failure tests; reproducible estimate fixtures.                                | Matching maps/config/tests; A1.01                                                            |
| A1.10 | Read-only insertion evaluator creates first-run or shared-run proposal preserving all committed windows; no unverified optimizer fallback.                   | Pickup/dropoff deadlines, first pickup reachability, transfer time, round-trip and no-solution fixtures.           | Matching feasibility/optimizer/tests; A1.06, A1.09                                           |
| A1.11 | Amend statistics, cache warm-up and diagnostics for route-free drivers and terminal request outcomes; record feasibility failures separately from low fit.   | Idempotent job tests; bounded non-PII metric labels.                                                               | Worker stats/cache jobs/tests, matching metrics; A1.07                                       |
| A1.12 | Run amended integration, property and performance suites with mixed driver populations.                                                                      | Matching P50 <120ms/P99 <400ms at 500 drivers, >=90% line/85% branch coverage; report fresh baseline in `PERF.md`. | Matching tests, API integration tests, `PERF.md`; A1.08, A1.11                               |

Build order: A1.01 -> A1.02 -> A1.03/A1.04 -> A1.05/A1.06 -> A1.07 -> A1.08 -> A1.11/A1.12. A1.09 -> A1.10 supplies the preview/acceptance path and must finish before Phase 1B acceptance work. T1.12/T1.13 consume A1.08, and T1.15 consumes A1.10. The existing `httpx` dependency has moved from Python's development extras to runtime for the bounded Google Routes matrix adapter; no new service is introduced.

## Remaining Phase 1A tasks

- **T1.12:** Recommended driver cards plus browse-all pagination. Display pickup-to-route estimate, no-route state, offered availability, seats, price and review status. A lower-ranked candidate remains selectable for a request. Verify all loading/empty/error/populated states and accessibility.
- **T1.13:** Public profile uses the same requestability rules and commute context. CTA is "Send request", wired through Phase 1B T1.22; never "Book now" or immediate subscription activation. No exposure of existing riders' routes/stops.
- **Former Phase 1A T1.14:** Superseded. Shared feasibility is A1.06/A1.10; atomic allocation belongs to Phase 1B T1.16. T1.14 now refers exclusively to request creation in `todo.md`.

## Checkpoints and evidence

- After A1.04: route-free and established drivers can set schedules with or without a declared area; existing commitments survive backfill and edits.
- After A1.08: a consumer can discover both types, compare truthful distances, and access all available candidates; platform bounds and any declared-area restriction are enforced through direct API calls.
- After A1.10: first-run and shared-run proposals preserve pickup and arrival commitments; unknown timing cannot become acceptance approval.
- Phase 1A exit: A1.12 and amended T1.12/T1.13 pass; updated shared vectors distinguish discovery, ranking and feasibility. Phase 1A alone does not claim the request/accept flow is shipped.
- Phase 1B exit: real-device discovery -> request -> preview -> acceptance; concurrent last-seat and first-run acceptance proofs; expiry/withdrawal races; cross-driver duplicate rider protection; no slots or billing for pending requests.

## Migration, risks and rollout

Completed T1.01-T1.11 work is reusable but must not be treated as compliant without amendment verification. Keep old v1 fixtures identifiable until the replacement contract is deployed; add new versioned fixtures rather than changing expected outcomes silently. Migrate the request-setup constraint and contracts before enabling revised discovery. Drivers must declare a service area and remain subject to launch bounds, schedule availability, and capacity; legacy profiles still require explicit setup. Backfill run assignments from commitments; ambiguous historical schedules need review and cannot be silently dropped.

Wider candidate pools can increase search cost and request volume; retain pagination and existing rate limits. New drivers have unknown route proximity; UI and neutral ranking must not misrepresent it. Estimates can be wrong in traffic; use documented buffers and freshness policy, and monitor missed windows. Changes in roster/coverage invalidate proposals. Preserve accepted commitments during rollback; disabling new discovery must never erase active runs or subscriptions. Routing policy values and the migration rehearsal must be recorded before enabling acceptance.

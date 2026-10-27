# ADR-011: Service-area discovery and driver-approved recurring runs

## Status

Accepted product direction; implementation progress and verification are recorded in [the amendment report](../../tasks/PHASE1A-amendment-progress.md). Phase 1B acceptance and deployment remain pending their gates.
Supersedes the mandatory-corridor discovery and blanket overlapping-window rejection in the original Phase 1A plan, B1/B4 of `SPEC-DELTA-mvp.md`, and the subscription-only reconstruction model in ADR-009 where inconsistent below.

## Date

2026-10-21; amended 2026-10-24

## Context

A verified driver without a preset route can establish a route around their first consumer. Consumers should see the closest/best commute matches first, but may request any available driver serving the commute. A driver decides whether to accept after reviewing the locations and impact on their existing run. Geographic coverage alone does not establish that a driver can arrive on time.

## Decision

1. Separate discovery eligibility, recommendation ranking, and acceptance feasibility. Recommendation scores and corridor distance are not authorization rules.
2. Require an approved driver, declared service area covering both commute endpoints, offered days/time availability, and available capacity. A valid route is optional for a driver who has not established one. Existing commitments remain binding.
3. Offer ranked recommendations and paginated access to all available candidates. Consumers may request a lower-ranked driver; no minimum score, corridor radius, or old projection-direction check may prevent this.
4. Display the estimated shortest geographic distance from the requested pickup to the driver's relevant route, with destination distance available as well. This is distance to a route, not road detour, travel time, driver live location, or a walking instruction. With no route, return null and display "No established route"; never fabricate zero distance.
5. A request creates `PENDING` state and reserves nothing. Only the owning driver can accept. Acceptance revalidates platform bounds, any declared service-area coverage, offered availability, capacity, and all affected committed pickup/dropoff windows before atomically activating the subscription.
6. Represent recurring shared runs explicitly, by driver, operating days and leg, with ordered pickup/dropoff stops and versioned commitments. Compatible riders can share a run even when their time windows overlap. Separate runs must allow travel between them. Both legs of a round trip must pass independently.
7. Preview and acceptance use the same feasibility evaluator and versioned travel-time inputs. Road travel estimates, stop service time, and operational buffers support timing checks. Straight-line distance alone cannot certify arrival feasibility. Unknown feasibility prevents acceptance, with a retryable explanation. No claim is made to guarantee actual traffic conditions.
8. Serialize acceptance on a stable driver profile row, including the empty-roster case. Revalidate the roster/request/availability version, capacity and timing in a `SERIALIZABLE` transaction, commit the run, stops, subscription and derived slots together, and emit notifications through a transactional outbox. At most three retries after the initial attempt on SQLSTATE `40001`, with jittered exponential backoff; business failures are not retried.
9. Keep the matching service read-only. Compute routing proposals outside the write transaction; the API rejects/recomputes proposals whose roster, configuration, or estimate version is no longer valid. No external routing request is made while holding database locks.
10. Source of truth is active subscription commitments plus their recurring run assignments and stop order. Schedule slots and display geometry are derived. Cancellation releases commitments only on its effective date. Route edits cannot silently alter existing agreed windows.
11. Keep storage types aligned with their established PostgreSQL semantics: operating days use `smallint`, recurring departure-of-day observations use `TIME`, and schedule legs use the native `ScheduleLegType` enum. Do not coerce a time of day into a timestamp or replace the existing enum with text solely to match a generated contract.
12. Model the consumer's commute as `ONE_WAY` or `ROUND_TRIP`. The first requested segment is always `DEPARTURE`; round trips add a later `PICKUP` segment. Driver availability is a set of recurring day/time intervals, independent of segment names. Search matches every requested segment against those intervals; committed runs and trips retain `DEPARTURE`/`PICKUP` segment identity.

## Alternatives Considered

- **Mandatory preset corridor:** prevents a route-free driver from finding their first consumer and blocks consumer choice; rejected.
- **Allow requests outside platform bounds:** cannot be safely validated by the launch market's routing and operations; rejected. Drivers without a personal service-area polygon may still appear for commutes inside platform bounds.
- **Driver acceptance without system checks:** can overfill the vehicle or make existing promises impossible; rejected.
- **Reject every overlapping subscription window:** prevents legitimate shared transport; rejected.

## Consequences

The current matching implementation needs amendments, not merely new button text. Existing completed tasks remain historical evidence, not proof of the new rules. Do not infer a city-wide polygon or mark broken route data as intentionally route-free. New drivers may omit a personal service-area polygon; discovery still enforces platform bounds, availability and capacity, then ranks by route proximity where a route exists. Drivers make the final request decision. Existing drivers with a declared polygon retain that filter, and legacy profiles still require explicit setup. Precise third-party rider stops are never included in consumer discovery responses. Driver previews disclose only information needed for that driver's request and roster.

Technical details (DDL, versioned contracts, ranking fixtures, routing-estimate policy and backfill) are delivered by the ordered amendment tasks, not by this documentation change. Live traffic rerouting, bidding, and automatic acceptance remain out of scope.

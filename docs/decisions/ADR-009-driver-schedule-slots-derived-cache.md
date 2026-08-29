# ADR-009: `driver_schedule_slots` as a Derived Conflict-Detection Cache

## Status

Accepted

## Date

2026-08-25

## Context

In RouteRide's recurring subscription model, drivers publish fixed weekly route legs (e.g., Morning Home-to-School, Afternoon School-to-Home). As consumers book seats for their children, each subscription claims capacity on a specific driver's recurring time slot.

When matching searches and booking subscriptions, the matching engine must determine whether a driver has an available seat without conflicting with existing commitments:

- If `subscriptions` and schedule availability are managed as two separate authoritative tables, concurrent bookings or cancellations can cause state divergence, leading to double-booked seats.
- Conversely, calculating schedule conflicts by joining across all historical `subscriptions` on every search request introduces severe query latency and locking contention.

## Decision

1. Declare the **`subscriptions`** table as the **single authoritative source of truth** for all active seat reservations.
2. Treat **`driver_schedule_slots`** as a **derived conflict-detection cache table**.
3. All writes that alter subscription state (`ACCEPTED`, `PAUSED`, `CANCELLED`, `COMPLETED`) rebuild the driver's affected schedule slots transactionally within a PostgreSQL `SERIALIZABLE` or `REPEATABLE READ` transaction with explicit row-level locking (`SELECT ... FOR UPDATE`).
4. If cache corruption is ever suspected, a background reconciliation task can safely rebuild all `driver_schedule_slots` rows from the `subscriptions` table with zero data loss.

## Alternatives Considered

### Direct Ad-Hoc Joins on `subscriptions` Table

- _Pros_: No secondary table to maintain.
- _Cons_: High latency during search; complex PostGIS bounding box filtering combined with time-window range overlaps creates high database CPU load.
- _Rejected_: Cannot meet the P99 < 150ms search latency SLA under 500 concurrent driver searches.

### Independent Schedule Slots Table Updated Asynchronously

- _Pros_: Fast async updates.
- _Cons_: Eventual consistency causes race conditions where two parents can simultaneously book the last seat on a vehicle.
- _Rejected_: Double-booking a child's seat to school is a severe safety and trust failure.

## Consequences

- **Positive**: Blazing fast search and conflict checking via indexed `driver_schedule_slots` rows.
- **Positive**: Guaranteed zero double-booking through atomic transactional cache updates.
- **Positive**: Trivially self-healing: cache is completely rebuildable from the immutable `subscriptions` ledger.

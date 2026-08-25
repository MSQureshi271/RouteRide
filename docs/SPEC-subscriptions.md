# SPEC: subscriptions

> **Module ID:** `subscriptions`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`subscriptions`)

---

## 1. Objective

Manage recurring monthly transport subscriptions between parents and drivers. Govern the complete subscription lifecycle: `REQUESTED` -> `ACCEPTED` (or `DECLINED`) -> `ACTIVE` -> `PAUSED` (Phase 2) -> `CANCELLED`. Enforce atomic seat conflict locking via PostgreSQL transactions, and maintain the derived `driver_schedule_slots` conflict-detection cache.

### User Personas
- **Consumer (Parent):** Requests a monthly seat subscription for a child on a specific driver run.
- **Driver:** Reviews pending subscription requests, views child details and pickup location, and accepts or declines.

---

## 2. Commands

```bash
# Test subscriptions module
pnpm --filter api test -- src/modules/subscriptions
pnpm --filter api test:integration -- test/subscriptions.integration.test.ts
```

---

## 3. Project Structure

```
apps/api/src/modules/subscriptions/
├── subscriptions.controller.ts     # Request, accept, decline, cancel endpoints
├── subscriptions.service.ts        # Lifecycle state machine & atomic seat locks
├── schedule-slots.service.ts       # Cache sync for driver_schedule_slots table
└── dto/                            # Subscription request/response DTOs
```

---

## 4. Code Style & Rules

- **Concurrency & Locking:** Seat allocation MUST execute inside a `SERIALIZABLE` or `REPEATABLE READ` PostgreSQL transaction using `SELECT ... FOR UPDATE` on the driver's profile/schedule row to prevent oversubscription.
- **Source of Truth:** The `subscriptions` table is the sole source of truth; `driver_schedule_slots` is a derived index rebuilt transactionally upon any roster change (ADR-009).
- **Cancellation Policy:** Enforce 1-month minimum commitment and 7-day notice requirement for consumer-initiated cancellations (Q6).

---

## 5. Testing Strategy

- **Unit Tests:** State transition rules (cannot accept an already cancelled subscription), cancellation date calculation (effective at month boundary with 7d notice).
- **Concurrency Integration Tests:** Simulate 10 simultaneous subscription requests against a driver with 1 remaining seat. Exactly 1 request succeeds with `201 Created`; 9 fail with `409 Conflict (SEAT_UNAVAILABLE)`.

---

## 6. Boundaries & Non-Goals

### In Scope
- Monthly subscription request, driver approval workflow, cancellation.
- Atomic seat reservation and schedule slot indexing.
- Parent subscription dashboard and driver passenger roster.

### Non-Goals (Out of Scope)
- Daily on-demand ride booking (subscriptions are monthly recurring only).
- Mid-month pro-rated refund calculations (handled in payments module).

---

## 7. Success Criteria

1. Concurrent subscription requests never exceed driver vehicle seat capacity.
2. Driver accepting a request transitions state to `ACCEPTED` and increments occupied seats.
3. Consumer cancelling with < 7 days notice sets termination date to the following billing cycle end.
4. All subscription state changes emit audit events and trigger push notifications.

---

## 8. Open Questions & Known Gaps

- *Resolved in ADR-009:* `driver_schedule_slots` confirmed as derived conflict cache, updated transactionally.

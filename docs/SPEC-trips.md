# SPEC: trips

> **Module ID:** `trips`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`trips`)

---

## 1. Objective

Provide daily recurring trip instantiation from active subscriptions, govern the trip execution state machine (`SCHEDULED` -> `IN_PROGRESS` -> `COMPLETED` / `CANCELLED`), generate driver turn-by-turn stop manifests (morning pickup runs, afternoon school return runs), and manage per-rider pickup/dropoff status marking (`WAITING` -> `PICKED_UP` -> `DROPPED_OFF` -> `NO_SHOW`).

### User Personas
- **Driver:** Views daily manifest, clicks "Start Trip", marks students as picked up or dropped off with one tap.
- **Consumer (Parent):** Receives instant alerts and timeline updates as their child is boarded and safely delivered to school or home.

---

## 2. Commands

```bash
# Test trips module
pnpm --filter api test -- src/modules/trips
pnpm --filter api test:integration -- test/trips.integration.test.ts
```

---

## 3. Project Structure

```
apps/api/src/modules/trips/
├── trips.controller.ts             # Driver run list, start trip, mark stop endpoints
├── trips.service.ts                # Trip execution lifecycle & state machine
├── trip-generator.service.ts       # Cron job generating daily trip instances from subscriptions
├── manifest.service.ts             # Optimized stop-ordering calculator
└── dto/                            # Trip & stop update DTOs
```

---

## 4. Code Style & Rules

- **State Machine Integrity:** Illegal status transitions (e.g. `SCHEDULED` directly to `COMPLETED` without starting) throw `400 BAD_REQUEST`.
- **Chronological Generation:** Daily trips generated at 00:00 UTC for the current business day excluding configured holidays.
- **Auditability:** Every stop status update records an immutable timestamp and the driver's location coordinate at the moment of the action.

---

## 5. Testing Strategy

- **Unit Tests:** Trip state machine validations, stop sequence ordering.
- **Integration Tests:** Daily trip generation cron job generates exact trips for all active subscriptions; driver marks child picked up -> parent receives status update and notification event.

---

## 6. Boundaries & Non-Goals

### In Scope
- Daily recurring trip instance generation.
- Stop manifests with student pickup/dropoff points.
- Stop marking and passenger status tracking.

### Non-Goals (Out of Scope)
- Dynamic route re-routing during active runs (routes follow predetermined fixed schedule).
- In-vehicle video streaming or biometric passenger scanning.

---

## 7. Success Criteria

1. Daily trip generator creates trip records for all active subscriptions with correct rider stops.
2. Driver can start trip and transition individual stops from `WAITING` to `PICKED_UP` and `DROPPED_OFF`.
3. Completing all stops transitions the overall trip status to `COMPLETED`.
4. Marking a rider as `PICKED_UP` triggers a push notification to that rider's parent within < 1000ms.

---

## 8. Open Questions & Known Gaps

- *Resolved in plan.md §10.8:* Foreign key between `trips` and `location_logs` normalized in migration v2.

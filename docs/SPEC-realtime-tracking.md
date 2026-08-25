# SPEC: realtime-tracking

> **Module ID:** `realtime-tracking`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`realtime-tracking`)

---

## 1. Objective

Provide low-latency (< 500ms), channel-authorized real-time telemetry streaming over Socket.IO and Redis Pub/Sub. Ingest driver GPS coordinates at 3–5s intervals during active trips, broadcast live positions to authorized parents whose children are on that trip, buffer coordinates for live trail display, and persist location trails to PostgreSQL with automated 30-day data purging.

### User Personas
- **Driver Device:** Streams GPS telemetry (`lat`, `lng`, `speed`, `heading`, `timestamp`) while a trip is `IN_PROGRESS`.
- **Consumer (Parent):** Views driver vehicle marker moving in real-time along the commute corridor on the map screen.

---

## 2. Commands

```bash
# Test realtime tracking module
pnpm --filter api test -- src/modules/realtime
pnpm --filter api test:integration -- test/realtime.integration.test.ts
```

---

## 3. Project Structure

```
apps/api/src/modules/realtime/
├── realtime.gateway.ts             # Socket.IO WebSocket gateway & connection auth
├── location-stream.service.ts      # Coordinate ingestion, Redis pub/sub broadcasting
├── room-auth.service.ts            # Channel authorization guard (Doubt-Driven Test)
├── location-purge.cron.ts          # 30-day hard deletion job for location_logs
└── dto/                            # Telemetry message schemas
```

---

## 4. Code Style & Rules

- **Channel Authorization:** Clients can ONLY join `trip:${tripId}` rooms if the authenticated user is either the assigned driver or a parent of an enrolled rider on that specific trip. Unauthorized join attempts are strictly rejected.
- **Privacy & Redaction:** Coordinates in server application log files MUST be rounded to 2 decimal places (e.g. `24.86, 67.01`). Raw 6-decimal-place coordinates are only transmitted across the active WebSocket room and stored in `location_logs`.
- **Data Retention:** Hard delete all rows in `location_logs` older than 30 days via daily cron (ADR-010).

---

## 5. Testing Strategy

- **Unit Tests:** Coordinate payload validation, room name parser, 30-day retention date boundary calculator.
- **Integration Tests:**
  - Socket.IO connection authentication with valid/invalid JWT.
  - Channel authorization test (Doubt-Driven AC-4.1): Parent A attempts to join Parent B's child trip room -> rejected.
  - Redis fan-out test: Emitting location on Node Instance 1 delivers event to subscribed client on Node Instance 2.

---

## 6. Boundaries & Non-Goals

### In Scope
- Driver GPS ingestion (5-second throttle).
- Socket.IO Redis adapter multi-node fanout.
- Room-level RBAC and trip participant verification.
- 30-day PostgreSQL location history purge.

### Non-Goals (Out of Scope)
- Firebase Realtime Database sync (dropped in ADR-008).
- Permanent indefinite historical telemetry archiving.

---

## 7. Success Criteria

1. Driver location updates broadcast to connected room participants with < 300ms latency.
2. Unauthorized users receive `403 Unauthorized Room Join` when attempting to subscribe to a foreign trip room.
3. Coordinates older than 30 days are purged permanently from `location_logs` by the purge cron job.

---

## 8. Open Questions & Known Gaps

- *Resolved in ADR-004 & ADR-010:* Socket.IO + Redis pub/sub selected; 30-day hard purge enforced.

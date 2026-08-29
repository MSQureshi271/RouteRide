# ADR-008: Elimination of Firebase Realtime Database from MVP Architecture

## Status

Accepted

## Date

2026-08-25

## Context

Early architectural sketches suggested using Firebase Realtime Database (RTDB) alongside PostgreSQL, Redis, Socket.IO, and FCM for live driver GPS coordinate fan-out and trip status broadcasting.

Evaluating this multi-store approach against `.agents/skills/using-agent-skills` §4 (_Enforce Simplicity_) and the TRD trust boundary model surfaces severe redundancies:

1. **Four Concurrent Communication Paths**: Trip state and location updates were proposed to travel over:
   - PostgreSQL (audit log and trip state ledger)
   - Redis Pub/Sub (inter-process message distribution)
   - Socket.IO WebSockets (live parent tracking client connection)
   - Firebase RTDB (redundant live location mirror)
   - FCM (push notifications for lifecycle alerts)
2. **Split-Brain Risk**: Having Firebase RTDB hold live coordinates while Postgres holds trip milestones (`STARTED`, `PICKED_UP`, `DROPPED_OFF`) creates a dual-source-of-truth problem where clients can observe conflicting state if network partitions occur.
3. **Data Privacy & Compliance**: GPS coordinates of minors streamed to Google Firebase RTDB adds another external cloud processor and data residency trust boundary to audit under the Data Privacy Register (`T-D.08`).

## Decision

**Completely remove Firebase Realtime Database from the RouteRide MVP stack.**

Live realtime telemetry and trip state are architected cleanly as:

- **Driver Mobile App → API Server**: Ingests GPS locations over WebSocket / HTTP.
- **Redis Pub/Sub**: Fans out location frames to active server nodes.
- **API Server → Parent Mobile App**: Streams 2-decimal-place rounded coordinates over Socket.IO WebSockets in real time.
- **PostgreSQL**: Persists trip state transitions and raw trajectory coordinates for 30 days.
- **FCM**: Sends background push notifications when app is backgrounded/killed.

## Alternatives Considered

### Retaining Firebase RTDB for GPS Fan-Out

- _Pros_: Managed client SDK handles reconnection natively.
- _Cons_: Introduces extra vendor dependency, duplicated state synchronization, increased egress costs, and extra security boundary.
- _Rejected_: Socket.IO + Redis pub/sub delivers lower latency, unified authentication with JWT, and complete infrastructure control.

## Consequences

- **Positive**: Single source of truth for trip lifecycle and telemetry.
- **Positive**: Simplified infrastructure, zero Firebase RTDB billing costs, and fewer trust boundaries.
- **Positive**: Less client complexity (one Socket.IO client in the React Native app instead of multiple SDKs).

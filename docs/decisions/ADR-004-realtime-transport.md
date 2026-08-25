# ADR-004: Realtime Transport — Socket.IO 4 + Redis Pub/Sub Adapter

## Status

Accepted

## Date

2026-08-23

## Context

RouteRide requires a bidirectional realtime channel between the server and mobile clients for three use cases (TRD §6):

1. **Driver location stream** — drivers emit their GPS position every 5 seconds while a trip is active. Consumers subscribed to that trip receive position updates with < 2 s end-to-end latency (TRD §6.1).
2. **Trip status events** — `trip:started`, `trip:pickup_marked`, `trip:dropoff_marked`, `trip:completed` fan out to all riders on the trip and their guardians (TRD §6.2).
3. **Driver run list updates** — new subscriptions and cancellations update the driver's run list in real time (TRD §6.3).

Two transport options were evaluated:

1. **Socket.IO 4 + Redis pub/sub adapter** — the TRD §6.4 fan-out design and the mobile `socket.io-client` version pin in §2.1 both specify this stack.
2. **Amazon API Gateway WebSocket API** — a fully managed WebSocket service backed by DynamoDB connection management.

The API service (`apps/api`) runs as a horizontally scaled ECS service. Any realtime solution must work correctly across multiple API instances — a message published on instance A must reach a consumer connected to instance B.

---

## Decision

**Use Socket.IO 4 with the `@socket.io/redis-adapter` on the API service. Drivers use sticky sessions (IP hash) on the ALB. Consumers do not require stickiness.**

---

## Deciding Factor

**The TRD's fan-out design (`§6.4`) and the mobile client SDK version pin (`socket.io-client` in TRD §2.1) already specify Socket.IO. The Redis adapter is the cross-node fan-out mechanism. API Gateway WebSocket would require rewriting the connection model with no correctness benefit and a higher operational cost at low traffic volumes.**

---

## Alternative Considered

### Amazon API Gateway WebSocket API

**Pros:**
- Fully managed — no sticky-session configuration.
- Per-message billing; no idle connection cost at zero load.
- Scales to millions of connections without configuration.

**Cons and rejection rationale:**

1. **SDK incompatibility.** Mobile clients (TRD §2.1) pin `socket.io-client`. API Gateway WebSocket is a plain WebSocket endpoint — it does not speak the Socket.IO protocol (which layers rooms, namespaces, acknowledgements, binary events, and auto-reconnect on top of WebSocket). Mobile clients cannot connect to it without replacing the SDK.

2. **Fan-out model mismatch.** TRD §6.4 specifies a room-per-trip fan-out: a driver emits to a named room (`trip:{tripId}`) and all subscribers in that room receive it. API Gateway requires the server to maintain a connection registry in DynamoDB and broadcast to each connection ID individually. At 50 riders per trip, that's 50 DynamoDB reads and 50 `@connections/POST` calls per location update, every 5 seconds, per active trip. The latency and cost of this pattern are incompatible with the < 2 s delivery SLA.

3. **Sticky session is a non-issue with Socket.IO.** Socket.IO's Redis adapter was built for exactly the multi-node case. A driver's socket registers in a room on one instance; the Redis adapter publishes to a channel; every other instance re-emits to local clients in that room. The adapter has been in production use at scale since Socket.IO 2.x. It is not an experimental feature.

4. **Cost at low volume.** API Gateway WebSocket charges $0.25 per million connection-minutes and $1.00 per million messages. At a 500-driver MVP with 8-hour active windows, the room-fan-out model pushes message counts into millions per day rapidly. Socket.IO on ECS with ElastiCache Redis is a fixed-cost model at this scale.

**Rejected.** The SDK incompatibility alone blocks this option; the fan-out latency and cost make it doubly unsuitable.

---

## Consequences

### Connection model

- Clients connect to `wss://api.routeride.com/ws` via Socket.IO's `websocket` transport (polling fallback disabled — React Native WebSocket support is reliable on Expo SDK 53).
- **Auth on upgrade**: the Socket.IO `auth` payload carries the JWT access token. The server validates the JWT in the `io.use()` middleware before the connection is admitted. An invalid or expired token results in a `disconnect` with error code `UNAUTHENTICATED`. Refresh is the client's responsibility before reconnecting.
- **No unauthenticated connections** are held in any room. A connection that passes auth but has no open trip is disconnected after 30 seconds of inactivity.

### Room structure

```
trip:{tripId}          ← all consumers tracking this trip (joined on trip:started event)
driver:{driverUserId}  ← driver's own socket for receiving run list updates
```

- Consumers join `trip:{tripId}` when the `trip:started` event is received; they leave when `trip:completed` or `trip:cancelled` arrives, or on disconnect.
- The API service joins a driver to `driver:{driverUserId}` on connect (after auth).
- A consumer cannot join a trip room unless their rider has an active subscription on that trip. Room membership is validated server-side at join time.

### Driver sticky sessions

- The ALB uses **IP-hash routing** for the `/ws` path prefix, ensuring a driver's WebSocket connection always reaches the same ECS instance.
- **Why sticky for drivers but not consumers:** Location updates from a driver flow server→consumer, not consumer→server. The driver's socket must remain on one instance so the location-emit handler is co-located with the emitting socket. Consumers only receive; the Redis adapter fans out to them regardless of which instance they're on.
- Sticky sessions are a liveness requirement for the driver connection. If the sticky instance becomes unhealthy, the ALB deregisters it and the driver reconnects to a new instance (Socket.IO auto-reconnect with exponential backoff, max 5 attempts before presenting a UI error).

### Connection duration constraints

- Mobile clients hold WebSocket connections for the duration of an active trip (≤ 4 hours in practice per TRD §6.1 timing assumptions).
- ALB idle timeout is set to **3600 seconds** (1 hour) for the WebSocket listener. The Socket.IO server sends a ping every 25 seconds; clients respond with pong. Any connection that misses 3 pings is considered stale and disconnected.
- ECS task drain timeout is **60 seconds**. During a rolling deploy, in-flight trips will see a disconnect and reconnect. The client's auto-reconnect handles this transparently; the UI shows a "Reconnecting…" indicator.

### Payload size constraints

- Each location update payload must be ≤ **1 KB** (driver ID, trip ID, latitude, longitude, timestamp, heading, speed). Coordinates are transmitted at full precision in-flight (rounding happens at the logging boundary per ADR-010 / T0.16, not in transit).
- Trip status event payloads must be ≤ **4 KB** to stay within a single WebSocket frame.
- Binary payloads are not used. All events are JSON. Socket.IO's `msgpack` parser is not enabled — the JSON parser is sufficient for these payload sizes.

### Redis adapter configuration

- The `@socket.io/redis-adapter` connects to ElastiCache Redis 7 (the same cluster as rate limiting and OTP storage).
- Channel namespace: `socket.io#/ws#` (default). If a channel separation is needed in future, a custom `key` prefix is added to the adapter constructor.
- The adapter uses **pub/sub** (not streams). ElastiCache Redis 7 supports both; pub/sub is the correct choice for ephemeral location events that have no replay value.
- Adapter events (connect/disconnect notifications) are sent to the `socket.io-adapter-monitor` channel. This is unused in MVP but left in place for debugging.

### Auth-on-upgrade constraint detail

```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token as string | undefined;
  if (!token) return next(new Error('UNAUTHENTICATED'));
  try {
    const payload = await jwtService.verify(token);
    socket.data.userId = payload.sub;
    socket.data.role = payload.role;
    next();
  } catch {
    next(new Error('UNAUTHENTICATED'));
  }
});
```

The JWT is validated on every new connection. Refresh-token rotation (ADR per T0.27) means a client that has been disconnected for > 15 minutes will need to refresh before reconnecting. The mobile client handles this in the reconnection handler.

### Verification note

The acceptance criterion for this ADR includes a two-node fan-out spike. The spike is run locally with docker-compose:

```bash
# Start two API instances and Redis
docker compose up api-1 api-2 redis

# Connect a driver socket to api-1, a consumer socket to api-2
# Emit a location update from the driver
# Assert the consumer receives it within 200ms
```

This spike is recorded as passing and is not a CI test (it requires a multi-container environment). It is re-run if the Redis adapter version changes.

---

## References

- `tasks/plan.md` §2, T-04 — Decision recorded as made 2026-08-23
- `tasks/plan.md` §4, ADR-004 — Architecture decision table entry
- TRD §2.1 — Mobile client SDK: `socket.io-client`
- TRD §6.1–§6.4 — Realtime events, fan-out design, and the Redis adapter specification
- TRD §11.1 — ElastiCache Redis 7 in the same VPC
- Socket.IO Redis Adapter — https://socket.io/docs/v4/redis-adapter/
- `ADR-008` — Firebase RTDB dropped from the stack (companion decision eliminating the fourth realtime path)

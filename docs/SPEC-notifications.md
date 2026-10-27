# SPEC: notifications

## Subscription request lifecycle (current)

Scope delta: [B6](SPEC-DELTA-mvp.md) / [ADR-011](decisions/ADR-011-service-area-discovery-and-driver-acceptance.md), master task T1.24.

- Notify the target driver of a committed pending request. Notify the consumer on acceptance, decline or expiry; notify the driver of pending withdrawal. `SUBSCRIPTION_ACCEPTED` is an event name for the transition to `ACTIVE`, not an `ACCEPTED` database state.
- Persist lifecycle events with the state transaction using an outbox, dispatch after commit, and deduplicate by event/recipient. A rolled-back acceptance emits nothing; a crash between commit and dispatch must be recoverable.
- Acceptance content reflects the committed days/legs and terms. Push/lock-screen previews never include child names, addresses, precise coordinates or another rider's schedule. Links require current role/ownership checks.
- Test replay, expiry-versus-acceptance races, failed transactions, and outbox recovery. Only the winning transition sends its event.

> **Module ID:** `notifications`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`notifications`)

---

## 1. Objective

Provide asynchronous, reliable, multi-channel notifications across Firebase Cloud Messaging (FCM push), SendGrid (transactional email), and Twilio (SMS critical fallback). Manage user notification preferences, rate-limiting, message deduplication, and dead-letter queue retries via BullMQ workers.

### User Personas
- **Consumer:** Receives live trip alerts ("Driver is 5 mins away", "Child picked up", "Monthly invoice ready").
- **Driver:** Receives ride requests, schedule reminders, document expiry notices, and subscription updates.

---

## 2. Commands

```bash
# Test notifications module
pnpm --filter api test -- src/modules/notifications
pnpm --filter api test:integration -- test/notifications.integration.test.ts

# Start BullMQ worker in dev
pnpm --filter api dev
```

---

## 3. Project Structure

```
apps/api/src/modules/notifications/
├── notifications.controller.ts     # Device token registration & user preference API
├── notifications.service.ts        # Dispatch facade (queues jobs into BullMQ)
├── notification.worker.ts          # BullMQ queue processor
├── providers/
│   ├── fcm.provider.ts             # Firebase Cloud Messaging adapter
│   ├── sendgrid.provider.ts        # SendGrid email adapter
│   └── twilio.provider.ts          # Twilio SMS adapter
├── templates/                      # Email & Push notification message templates
└── dto/                            # Notification DTOs & preferences
```

---

## 4. Code Style & Rules

- **Asynchronous Dispatch:** API endpoints never block on third-party notification APIs (FCM/SendGrid). All dispatches are placed on Redis BullMQ queues with unique idempotency job IDs.
- **Deduplication:** BullMQ jobs use deterministic job IDs (`${type}:${entityId}:${userId}:${event}`) to prevent duplicate sends on network retries.
- **Failures:** Exponential backoff with 3 retries. Permanent failures move to BullMQ Dead Letter Queue with alert emission.
- **Data Protection:** No student full names or precise coordinates in push payloads; push notifications use generic, sanitized tokens.

---

## 5. Testing Strategy

- **Unit Tests:** Template rendering, preference filtering, deduplication key generation.
- **Integration Tests:** BullMQ worker job processing with mocked FCM/SendGrid transport adapters asserting payload delivery and error retry mechanisms.

---

## 6. Boundaries & Non-Goals

### In Scope
- Push notifications via FCM (iOS APNs via FCM).
- Transactional emails for auth verification and payment invoices via SendGrid.
- SMS OTP and critical trip alerts via Twilio.
- User preference opt-in/opt-out per channel.

### Non-Goals (Out of Scope)
- Marketing newsletter campaigns.
- In-app live chat delivery (handled via WebSocket in `messaging` module).

---

## 7. Success Criteria

1. Queued notification jobs process and deliver to mock provider within < 2000ms.
2. User with SMS disabled receives email/push only for non-critical alerts.
3. Duplicate dispatch requests within 60s produce a single outbound message.
4. FCM error responses (e.g. `messaging/invalid-registration-token`) automatically clean up stale tokens in the DB.

---

## 8. Open Questions & Known Gaps

- *Resolved:* FCM service account credentials loaded securely from AWS Secrets Manager / environment variables.

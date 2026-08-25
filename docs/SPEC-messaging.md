# SPEC: messaging

> **Module ID:** `messaging`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`messaging`)

---

## 1. Objective

Provide direct, one-to-one asynchronous messaging and real-time chat between a parent and their assigned driver for active subscriptions. Provide predefined quick replies ("Running 5 mins late", "Child is waiting outside", "Will not attend today"), WebSocket message delivery via Socket.IO, unread message badges, push notification fanout for offline recipients, and automated 90-day message history retention.

### User Personas
- **Consumer (Parent):** Chats with the driver to coordinate morning pickups or notify of unexpected delays.
- **Driver:** Sends quick replies to parents before arriving at stops.

---

## 2. Commands

```bash
# Test messaging module
pnpm --filter api test -- src/modules/messaging
pnpm --filter api test:integration -- test/messaging.integration.test.ts
```

---

## 3. Project Structure

```
apps/api/src/modules/messaging/
├── messaging.controller.ts         # Chat threads, message history, unread count API
├── messaging.service.ts            # Message persistence & subscription validation
├── chat.gateway.ts                 # Socket.IO direct messaging events
├── message-retention.cron.ts       # 90-day message history purge job
└── dto/                            # Message send & quick-reply schemas
```

---

## 4. Code Style & Rules

- **Access Authorization:** Users can ONLY initiate or view chat conversations with parties they have an `ACTIVE` subscription with. Cold messaging random drivers is strictly forbidden.
- **Data Protection:** Chat messages older than 90 days are hard-deleted by the retention cron job to minimize PII exposure (docs/data-privacy-register.md).
- **Offline Delivery:** If the recipient is not connected to the WebSocket room, queue an immediate FCM push notification.

---

## 5. Testing Strategy

- **Unit Tests:** Message length validation (max 500 characters), quick-reply enum validation.
- **Integration Tests:**
  - Active subscription chat: Parent sends message -> Driver receives event in real-time.
  - Unauthorized chat test: Parent attempts to send message to an unlinked driver -> `403 Forbidden`.
  - 90-day retention purge test: Messages with timestamp > 90 days ago are purged.

---

## 6. Boundaries & Non-Goals

### In Scope
- 1-to-1 Consumer <-> Driver chat threads.
- Predefined quick replies.
- WebSocket real-time delivery + offline push notification fallback.
- 90-day message retention policy.

### Non-Goals (Out of Scope)
- Group chats between multiple parents.
- Media/image attachments or voice messages (text and quick-replies only in MVP).

---

## 7. Success Criteria

1. Authenticated message delivery between linked parent and driver completes in < 300ms.
2. Unlinked users cannot exchange messages.
3. Offline recipient receives push notification within 3 seconds of message send.
4. Retention job permanently clears messages older than 90 days.

---

## 8. Open Questions & Known Gaps

- *Resolved in docs/data-privacy-register.md:* 90-day retention period locked for chat messages.

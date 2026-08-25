# Threat Model — RouteRide MVP

> **Method:** STRIDE per trust boundary. Each boundary section lists assets, use cases, abuse cases, STRIDE threats, and mitigations. Every mitigation maps to a specific task in `tasks/todo.md`.
>
> **Status:** Initial model — 2026-08-23. Must be re-run at `T1.63` (after Phase 1 is complete) and before the penetration test (`T1.66`).
>
> **Scope:** Seven trust boundaries identified from the system diagram. Firebase RTDB is excluded (ADR-008 — dropped from the stack).
>
> **Verification:** Every "Never Do" item in `security-and-hardening` SKILL.md has a corresponding control assigned to a task in this document. See §8.

---

## Trust Boundaries Overview

```
[Mobile Consumer App]
        │ HTTPS/JWT
        ▼
[B1: Mobile → API]──────────────────────────────────────────────────
        │
        │ Internal VPC HTTP
        ├──────────────→ [B5: API → Matching Service]
        │
        │ Redis pub/sub
        ├──────────────→ [B3: WebSocket / Socket.IO]
        │
        │ HTTPS/webhook signature
        ├──────────────→ [B4: Stripe Webhook]
        │
        │ IAM role / pre-signed URL
        └──────────────→ [B6: S3 Upload]

[Mobile Driver App]
        │ WS + JWT
        └──────→ [B3: Driver → WebSocket]

[Admin Browser]
        │ HTTPS/JWT (ADMIN role)
        └──────→ [B7: Admin API]

[FCM / Apple APNs]
        │ Server-to-server
        └──────→ [B2: FCM]
```

---

## Boundary 1 (B1): Mobile Client → REST API

**Assets:** User credentials, JWT tokens, rider PII (names, addresses, photos), payment method data, driver route polylines, subscription state.

**Transport:** HTTPS (TLS 1.2+). JWT Bearer token in `Authorization` header.

### Use cases

| Use case | Actor | Action |
|----------|-------|--------|
| UC-1.1 | Consumer | Authenticate (register, login, OTP verify) |
| UC-1.2 | Consumer | Search for drivers |
| UC-1.3 | Consumer | Create and manage subscriptions |
| UC-1.4 | Consumer | View and manage riders (children) |
| UC-1.5 | Driver | Update profile, route, pricing |
| UC-1.6 | Both | View notifications |

### Abuse cases

| Abuse case | Threat type |
|------------|-------------|
| AC-1.1 | Attacker brute-forces passwords on login endpoint | DoS / Spoofing |
| AC-1.2 | Attacker enumerates valid phone numbers via registration/forgot-password responses | Information disclosure |
| AC-1.3 | Consumer attempts to read another consumer's riders by changing `riderId` in the URL | Elevation of privilege |
| AC-1.4 | Driver calls consumer-only endpoints using their own valid JWT | Elevation of privilege |
| AC-1.5 | Attacker replays a captured JWT after it expires | Spoofing |
| AC-1.6 | Attacker sends oversized payloads to cause OOM or slow processing | DoS |
| AC-1.7 | Attacker injects SQL/NoSQL via request body fields | Tampering |
| AC-1.8 | Attacker uses a valid consumer JWT to call `PATCH /drivers/me` | Elevation of privilege |

### STRIDE Analysis

| Threat | Description | Mitigation | Task |
|--------|-------------|------------|------|
| **S** Spoofing | Password brute-force on `POST /auth/login` | Rate limit 5/IP/10min; bcrypt cost 12; account lockout after 5 failed attempts | T0.19, T0.25 |
| **S** Spoofing | JWT replay after expiry | 15-minute access token TTL; signature verification on every request | T0.27 |
| **S** Spoofing | Forged Google OAuth token presented at `POST /auth/oauth/google` | Server-side JWKS signature verification with cached key set; `iss` and `aud` claims validated | T0.28 |
| **T** Tampering | SQL injection via request body | All DB access via Prisma parameterised queries or `$queryRaw` with parameterised inputs; Zod schema validation at every boundary | T0.14, T0.15 |
| **T** Tampering | Horizontal privilege escalation (reading another user's rider) | Resource ownership guard checks `rider.consumerId === req.user.id` before every read/write | T0.29, T0.42 |
| **R** Repudiation | No audit trail for admin actions | Admin actions (approve/suspend driver, issue refund) are logged with `requestId`, `adminUserId`, and the before/after state | T1.59 |
| **R** Repudiation | No audit trail for payment events | Stripe webhook events logged to `payment_events` with raw payload and signature status | T1.43 |
| **I** Information disclosure | Account enumeration via `forgot-password` timing | Identical response and timing for existing and non-existing phone numbers | T0.30 |
| **I** Information disclosure | Stack traces or internal error messages in API responses | Global exception filter returns `500 INTERNAL_ERROR` with `requestId` only; no stack trace | T0.15 |
| **I** Information disclosure | `passwordHash`, `stripeCustomerId`, `fcmToken` in API responses | Response DTOs exclude sensitive fields; all schemas use `.strict()` | T0.14, T0.15 |
| **D** DoS | Oversized payloads | NestJS body parser limits to 1 MB per request | T0.15 (global interceptor setup) |
| **D** DoS | Search endpoint hammered | 30/user/min rate limit on search; matching service timeout of 5s with 503 on breach | T0.19, T1.01 |
| **D** DoS | OTP flood on a phone number | 3/phone/5min rate limit; lockout after 3 attempts | T0.19, T0.26 |
| **E** Elevation of privilege | Vertical escalation: consumer calls driver endpoints | Role guard checks JWT `role` claim on every protected route | T0.29 |
| **E** Elevation of privilege | Consumer self-assigns ADMIN or DRIVER role at registration | Registration endpoint restricts role to `CONSUMER` or `DRIVER`; `ADMIN` roles are set directly in DB | T0.25 |

---

## Boundary 2 (B2): API → FCM / APNs (Push Notification Delivery)

**Assets:** FCM device tokens (link a device to a user), notification content (may contain rider names, trip status).

**Transport:** HTTPS from API/worker to Google FCM servers. `firebase-admin` SDK manages connection.

### Use cases

| Use case | Actor | Action |
|----------|-------|--------|
| UC-2.1 | System | Deliver trip status push to consumer |
| UC-2.2 | System | Deliver driver run-list update push |
| UC-2.3 | System | Deliver payment receipt push |

### Abuse cases

| Abuse case | Threat type |
|------------|-------------|
| AC-2.1 | Compromised FCM service account key allows attacker to send pushes to all users | Spoofing / Information disclosure |
| AC-2.2 | Stale FCM token results in messages delivered to a recycled device owned by a different person | Information disclosure |
| AC-2.3 | Notification body contains PII that appears in the device lock screen | Information disclosure |

### STRIDE Analysis

| Threat | Description | Mitigation | Task |
|--------|-------------|------------|------|
| **S** Spoofing | FCM service account key exfiltration | Key stored in AWS Secrets Manager; never in code or `.env` file; accessed via ECS task role at runtime | T0.20, T0.07 |
| **I** Information disclosure | Push delivered to recycled device | Clear FCM token from DB on `UNREGISTERED` response; prevent future delivery | T0.35 |
| **I** Information disclosure | Lock-screen push body reveals child's name or location | Notification body is generic ("Your ride is on the way") with no PII; details available only after app open + authentication | T0.35 |
| **D** DoS | FCM rate limits exceeded | BullMQ worker throttles to FCM rate limits; backoff on `QUOTA_EXCEEDED` response | T0.35 |

---

## Boundary 3 (B3): Driver → WebSocket (Socket.IO)

**Assets:** Driver's real-time GPS location during an active trip, trip status, driver run list.

**Transport:** WSS (WebSocket over TLS). Socket.IO protocol on top. JWT in `socket.handshake.auth.token`.

### Use cases

| Use case | Actor | Action |
|----------|-------|--------|
| UC-3.1 | Driver | Emit GPS position every 5 seconds during active trip |
| UC-3.2 | Consumer | Receive GPS positions for driver on their active trip |
| UC-3.3 | Driver | Receive run list updates |
| UC-3.4 | Consumer | Receive trip status events |

### Abuse cases

| Abuse case | Threat type |
|------------|-------------|
| AC-3.1 | Attacker connects with a valid consumer JWT and subscribes to a trip they are not a party to | Elevation of privilege / Information disclosure |
| AC-3.2 | Consumer tries to emit location events (pretending to be a driver) | Spoofing |
| AC-3.3 | Attacker floods the WebSocket with fake location events | Tampering / DoS |
| AC-3.4 | Expired JWT used to maintain a long-lived WebSocket connection | Spoofing |
| AC-3.5 | Consumer subscribes to `driver:{driverUserId}` room | Information disclosure |
| AC-3.6 | Consumer subscribes to another consumer's trip room | Information disclosure |

### STRIDE Analysis

| Threat | Description | Mitigation | Task |
|--------|-------------|------------|------|
| **S** Spoofing | Expired JWT maintains open WebSocket | JWT validated on connection; socket disconnected if the JWT expires mid-session (30-minute re-auth ping) | T1.30 (auth-on-upgrade spec) |
| **S** Spoofing | Consumer emits location events | Server-side event handler checks `socket.data.role === 'DRIVER'` before processing any `location:update` event | T1.30 |
| **T** Tampering | Fake location coordinates emitted by a malicious driver | Coordinates validated (within launch city bbox, ±90/±180 range, not NaN) before fan-out; out-of-range points are logged and discarded | T1.29 |
| **I** Information disclosure | Consumer joins a trip room they are not a party to | Room join handler verifies that the consumer has an active subscription on the tripId; rejects otherwise | T1.31 |
| **I** Information disclosure | Consumer subscribes to `driver:{id}` room | Room join handler blocks non-driver joins on `driver:` namespaced rooms | T1.31 |
| **D** DoS | Location event flood from a single driver socket | Server-side rate limit: one `location:update` per second per socket; excess events discarded without error | T1.29 |
| **E** Elevation of privilege | Consumer gains access to another trip's location | Channel-level authorisation verified on every room join; every room event checks membership server-side | T1.31 |

**Critical asset:** The channel-level authorisation test (`T1.31`) is listed in `tasks/plan.md` §9 as one of the eight mandatory doubt-driven artefacts. It asserts "only the assigned driver's channel is readable." This test must fail without the authorisation check and pass with it.

---

## Boundary 4 (B4): Stripe Webhook → API

**Assets:** Payment intent outcomes, charge events, Connect payout events. Acting on a forged or replayed webhook could credit a driver without charging the consumer, or vice versa.

**Transport:** HTTPS POST from Stripe to `POST /webhooks/stripe`. Stripe signs the payload with a webhook secret.

### Use cases

| Use case | Actor | Action |
|----------|-------|--------|
| UC-4.1 | Stripe | Deliver `payment_intent.succeeded` event |
| UC-4.2 | Stripe | Deliver `payment_intent.payment_failed` event |
| UC-4.3 | Stripe | Deliver `transfer.created` event for driver payout |

### Abuse cases

| Abuse case | Threat type |
|------------|-------------|
| AC-4.1 | Attacker forges a `payment_intent.succeeded` event to mark a subscription as paid | Spoofing / Tampering |
| AC-4.2 | Attacker replays a legitimate `payment_intent.succeeded` event to trigger a double credit | Tampering / Repudiation |
| AC-4.3 | Attacker probes the webhook URL with random payloads to discover system behaviour | Information disclosure |
| AC-4.4 | Attacker delivers a `payment_intent.succeeded` for a different customer's payment intent | Tampering |

### STRIDE Analysis

| Threat | Description | Mitigation | Task |
|--------|-------------|------------|------|
| **S** Spoofing | Forged webhook payload | Stripe HMAC-SHA256 signature verified using `STRIPE_WEBHOOK_SECRET` before payload is processed; reject if signature invalid | T1.43 |
| **T** Tampering | Replayed webhook event | Stripe event ID stored in `payment_events`; duplicate event IDs are idempotently ignored (unique constraint on `stripe_event_id`) | T1.43, T1.45 |
| **T** Tampering | Payment intent for wrong customer processed | `paymentIntentId` cross-referenced to the stored `subscription.stripePaymentIntentId`; mismatch rejects the event | T1.43 |
| **R** Repudiation | No record of which webhook events were received | Every webhook event (successful signature or not) logged to `payment_events` with raw payload hash and processing outcome | T1.43 |
| **I** Information disclosure | Error response reveals internal payment state | Webhook handler returns `200 OK` for all signature-valid events, including those it cannot process, to prevent enumeration. Invalid signature returns `400` with no body. | T1.43 |
| **D** DoS | Webhook endpoint flooded | Rate limit on `/webhooks/stripe` path; Stripe's own retry behaviour means this is low risk from legitimate events | T0.19 |

---

## Boundary 5 (B5): API → Matching Service (Internal)

**Assets:** Search parameters (rider pickup/destination — sensitive if rider is a minor), driver route polylines, ranked result list.

**Transport:** Internal VPC HTTP. No public internet exposure. No authentication between services (network isolation is the control).

### Use cases

| Use case | Actor | Action |
|----------|-------|--------|
| UC-5.1 | API | POST search request with rider coordinates and schedule |
| UC-5.2 | Matching | Return ranked list of eligible driver IDs |

### Abuse cases

| Abuse case | Threat type |
|------------|-------------|
| AC-5.1 | An attacker who gains foothold inside the VPC calls the matching service directly | Elevation of privilege |
| AC-5.2 | Matching service returns malformed response that the API processes without validation | Tampering |
| AC-5.3 | Matching service is overwhelmed by a high volume of search requests from the API | DoS |

### STRIDE Analysis

| Threat | Description | Mitigation | Task |
|--------|-------------|------------|------|
| **S** Spoofing | Internal attacker calls matching service directly | Matching service is in a private subnet with no public IP; Security Group allows inbound only from the API service's Security Group | T0.20 |
| **T** Tampering | Matching service returns unexpected or malicious response | API validates the matching service response against the JSON Schema in `packages/contracts` before using it; an invalid response produces `503` to the caller | T0.14, T1.01 |
| **I** Information disclosure | Search parameters (rider coordinates) logged in matching service | `apps/matching/app/logging.py` rounds coordinates to 2dp before logging; no full addresses logged | T0.16 |
| **D** DoS | Matching service overwhelmed | API enforces 5-second timeout; circuit breaker (3 failures in 10s → open for 30s) before rate-limiting search at the API boundary | T1.01, T0.19 |

---

## Boundary 6 (B6): S3 Document Upload (Pre-Signed PUT)

**Assets:** Driver identity documents (CNIC, licence, vehicle registration) — government-issued IDs. These are Sensitive (S class in the privacy register).

**Transport:** HTTPS to S3 endpoint. Pre-signed PUT URL issued by the API with 5-minute TTL, scoped to one S3 key.

### Use cases

| Use case | Actor | Action |
|----------|-------|--------|
| UC-6.1 | Driver | Request a pre-signed PUT URL for a document |
| UC-6.2 | Driver | Upload document directly to S3 using the pre-signed URL |
| UC-6.3 | Driver | Confirm upload to API; API verifies magic bytes server-side |

### Abuse cases

| Abuse case | Threat type |
|------------|-------------|
| AC-6.1 | Attacker uploads a malicious executable disguised as a PDF | Tampering |
| AC-6.2 | Attacker uses a pre-signed URL after it expires | Spoofing |
| AC-6.3 | Attacker uploads a file larger than the allowed size | DoS |
| AC-6.4 | Attacker accesses another driver's document directly via a guessed S3 key | Information disclosure |
| AC-6.5 | Attacker calls the confirm endpoint with a key they did not upload | Tampering |

### STRIDE Analysis

| Threat | Description | Mitigation | Task |
|--------|-------------|------------|------|
| **S** Spoofing | Using a pre-signed URL after expiry | Pre-signed URL TTL is 5 minutes; S3 rejects requests with an expired signature | T0.38 |
| **T** Tampering | Malicious file uploaded as a PDF | API reads magic bytes on confirmation step; rejects if bytes disagree with declared MIME type | T0.38 |
| **T** Tampering | Confirm endpoint called with a wrong S3 key | Confirm endpoint verifies the key matches the `pending_document` row for this driver; rejects mismatches | T0.38 |
| **R** Repudiation | No record of what was uploaded | `driver_documents` records upload timestamp, document type, status, and S3 key; admin audit log records every status change | T0.38, T1.59 |
| **I** Information disclosure | Guessed S3 key gives access to another driver's document | S3 object key includes a UUID; bucket has no public access; documents served only via short-lived pre-signed GET to admins | T0.38 |
| **I** Information disclosure | Document publicly readable | S3 documents bucket: `BlockPublicAcls: true`, `BlockPublicPolicy: true`, `IgnorePublicAcls: true`, `RestrictPublicBuckets: true` | T0.20 |
| **D** DoS | Oversized file upload | Pre-signed PUT URL generated with `Content-Length-Range` condition (max 10 MB); S3 rejects larger uploads | T0.38 |

---

## Boundary 7 (B7): Admin Browser → Admin API

**Assets:** All user data, driver verification status, payment and refund controls, system metrics, audit log. Full system access.

**Transport:** HTTPS. JWT with `role = ADMIN` or `FLEET_ADMIN`.

### Use cases

| Use case | Actor | Action |
|----------|-------|--------|
| UC-7.1 | Admin | View driver verification queue |
| UC-7.2 | Admin | Approve or reject a driver |
| UC-7.3 | Admin | Suspend a driver (3-strike) |
| UC-7.4 | Admin | Issue a refund |
| UC-7.5 | Admin | View live trips map |
| UC-7.6 | Admin | View audit log |
| UC-7.7 | Admin | Export user data (DSAR) |

### Abuse cases

| Abuse case | Threat type |
|------------|-------------|
| AC-7.1 | Attacker gains a consumer or driver JWT and calls admin endpoints | Elevation of privilege |
| AC-7.2 | Compromised admin account issues fraudulent refunds | Repudiation / Tampering |
| AC-7.3 | Admin reads another user's personal data without a legitimate reason | Information disclosure |
| AC-7.4 | CSRF attack causes an admin to approve a malicious driver | Tampering |
| AC-7.5 | Admin panel is publicly accessible from the internet | Information disclosure / All threats |
| AC-7.6 | SQL injection via admin search filters | Tampering |

### STRIDE Analysis

| Threat | Description | Mitigation | Task |
|--------|-------------|------------|------|
| **S** Spoofing | Non-admin JWT used on admin endpoints | Role guard verifies `jwt.role === 'ADMIN'`; admin endpoints are on a separate NestJS module with the guard applied at the module level | T0.29 |
| **S** Spoofing | Brute-force on admin login | Same rate limiting as consumer auth + admin accounts require a strong password policy; MFA is Phase 2 | T0.19, T0.25 |
| **T** Tampering | SQL injection via admin search | Prisma parameterised queries; Zod validation on all filter parameters | T0.14, T1.56 |
| **T** Tampering | Fraudulent refund via compromised admin account | Every refund action logged to audit log with `adminUserId`, `requestId`, amount, reason, and Stripe response; dual-approval for refunds above a threshold is Phase 2 | T1.57, T1.59 |
| **R** Repudiation | No audit trail for admin actions | Audit log (`audit_events` table) records every mutating admin action with actor, action, target, before/after, and timestamp | T1.59 |
| **I** Information disclosure | Admin panel publicly accessible | Admin ALB listener is in a private subnet or protected by IP allowlist (VPN / office IP); not exposed on the public ALB | T0.20 |
| **I** Information disclosure | Admin can export any user's data without leaving a trace | DSAR export action is logged to the audit log | T1.61, T1.59 |
| **D** DoS | Admin panel performance under large datasets | Admin list endpoints are paginated; the live trips map uses a bounding-box pre-filter; no unbounded queries | T1.56, T1.58 |
| **E** Elevation of privilege | Consumer role assumes admin by modifying local JWT | JWT signature verification prevents this; no admin role can be self-assigned | T0.27, T0.29 |

---

## §8. "Never Do" Coverage Matrix

This section verifies that every "Never Do" item from the `security-and-hardening` skill has a corresponding control in this threat model.

| "Never Do" item | Control | Task(s) |
|----------------|---------|---------|
| Never commit secrets to version control | Pre-commit hook (husky + detect-secrets); `.gitignore` covers `.env*`, `*.pem`, `*.key` | T0.01 |
| Never log sensitive data (passwords, tokens) | Pino redaction allowlist in `packages/config/src/logger.ts`; redaction tests | T0.16 |
| Never trust client-side validation as a security boundary | All Zod validation happens in NestJS pipe at the API boundary; mobile validation is UX-only | T0.14, T0.15 |
| Never disable security headers for convenience | Helmet configured globally; CSP/HSTS test asserts headers present | T0.19 |
| Never use `eval()` or `innerHTML` with user-provided data | Admin panel is Next.js; React's default JSX escaping; no `dangerouslySetInnerHTML` in any component | T1.56 (code review gate) |
| Never store sessions in client-accessible storage | Access token in Zustand memory store; refresh token in `expo-secure-store`; test asserts AsyncStorage is empty | T0.31 |
| Never expose stack traces or internal error details to users | Global exception filter; integration test asserting raw Error produces no stack in response | T0.15 |

---

## §9. Abuse Case → Test Task Mapping

Every abuse case named in this model must have a corresponding test. This table maps each abuse case to the task that implements the test.

| Abuse case | Test | Task |
|------------|------|------|
| AC-1.1 Password brute-force | Rate limit integration test on `/auth/login` | T0.19 |
| AC-1.2 Account enumeration | Timing and response identity test for known/unknown phone | T0.30 |
| AC-1.3 Horizontal privilege escalation (rider) | RBAC matrix test asserting consumer cannot read another's rider | T0.29 |
| AC-1.4 Vertical escalation (driver→consumer endpoint) | RBAC matrix test; role guard unit test | T0.29 |
| AC-1.5 JWT replay after expiry | Token expiry test in auth suite | T0.27 |
| AC-1.6 Oversized payload | Body parser size limit integration test | T0.15 |
| AC-1.7 SQL injection | Parameterised query asserted via Prisma type system; fuzz test on search params | T0.14 |
| AC-1.8 Consumer calls driver-only endpoint | RBAC matrix test | T0.29 |
| AC-2.2 Push to recycled device | FCM UNREGISTERED response test in notification worker | T0.35 |
| AC-3.1 Consumer joins wrong trip room | Room join authorisation test | T1.31 |
| AC-3.2 Consumer emits location event | Server event handler role-check test | T1.30 |
| AC-3.3 Location event flood | Rate limit per socket test | T1.29 |
| AC-3.4 Expired JWT on WebSocket | WebSocket auth-on-upgrade test | T1.30 |
| AC-3.6 Consumer joins another's trip room | Channel authorisation test (doubt-driven artefact) | T1.31 |
| AC-4.1 Forged webhook | Webhook signature verification test | T1.43 |
| AC-4.2 Replayed webhook | Idempotency unique-constraint test | T1.43, T1.45 |
| AC-5.2 Malformed matching response | Matching response validation test | T1.01 |
| AC-6.1 Malicious file upload | Magic bytes mismatch rejection test | T0.38 |
| AC-6.4 Guessed S3 key | Pre-signed URL scoped key + bucket ACL test | T0.38 |
| AC-7.1 Non-admin JWT on admin endpoints | RBAC matrix test | T0.29 |
| AC-7.3 Admin data export without trace | Audit log assertion on DSAR export | T1.61, T1.59 |
| AC-7.4 CSRF on admin action | SameSite cookie + CSRF token on mutating endpoints | T0.19 |

---

## §10. Re-Run Schedule

| Trigger | Action |
|---------|--------|
| After Phase 1 completes (`T1.63`) | Re-run full STRIDE model; update this document |
| Before penetration test (`T1.66`) | Share this document with pen tester as attack surface guide |
| Any new external integration added | Update the affected boundary section; add abuse cases |
| Any new trust boundary (new service) | Add a new boundary section with full STRIDE analysis |
| Production security incident | Treat as a missed threat; add to the relevant boundary section |

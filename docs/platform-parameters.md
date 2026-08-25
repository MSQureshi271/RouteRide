# Platform Parameters — RouteRide MVP

> **Purpose:** Every commercial and operational parameter that could be hardcoded as a literal is instead listed here with its environment variable name, its database-configurable row key (where applicable), its default value, and its valid range. This document drives the `.env.example` in `T0.07` and the `packages/config` validation schema.
>
> **Rule:** No business-logic literal in this list may appear in source code. Every value is read from `process.env` via the validated config loader or from a DB-configurable row at runtime.
>
> **Notation:**
> - `ENV` — environment variable, validated at boot by `packages/config`
> - `DB_CONFIG` — a row in the `platform_config` table, read at runtime, hot-reloadable without redeploy
> - `OPEN` — value not yet fixed; see the Open Questions section. Implementation of the affected feature is **blocked** until resolved.

---

## 1. Launch Market and Currency

> **Resolved 2026-08-25: Karachi, Pakistan (PKR / Asia/Karachi)**

| Parameter | Key | Type | Default | Status |
|-----------|-----|------|---------|--------|
| Launch city | `LAUNCH_CITY_NAME` | ENV | `"Karachi"` | **LOCKED** |
| Launch city bounding box (min lat) | `LAUNCH_CITY_BBOX_MIN_LAT` | ENV | `24.7000` | **LOCKED** |
| Launch city bounding box (max lat) | `LAUNCH_CITY_BBOX_MAX_LAT` | ENV | `25.1500` | **LOCKED** |
| Launch city bounding box (min lon) | `LAUNCH_CITY_BBOX_MIN_LON` | ENV | `66.8500` | **LOCKED** |
| Launch city bounding box (max lon) | `LAUNCH_CITY_BBOX_MAX_LON` | ENV | `67.3500` | **LOCKED** |
| City IANA timezone | `LAUNCH_CITY_TIMEZONE` | ENV | `"Asia/Karachi"` | **LOCKED** |
| Default currency (ISO 4217) | `DEFAULT_CURRENCY` | ENV | `"PKR"` | **LOCKED** |
| Stripe account country | `STRIPE_ACCOUNT_COUNTRY` | ENV | `"PK"` | **LOCKED** |

---

## 2. Driver Pricing

> **Q5 — Platform-enforced price range in PKR (integer paisas / cents). Confirmed against Karachi market.**

| Parameter | Key | Type | Default | Valid range | Notes |
|-----------|-----|------|---------|-------------|-------|
| Driver base price minimum (monthly, in paisas) | `DRIVER_PRICE_MIN_CENTS` | ENV | `500000` (PKR 5,000) | > 0 | Platform floor |
| Driver base price maximum (monthly, in paisas) | `DRIVER_PRICE_MAX_CENTS` | ENV | `3000000` (PKR 30,000) | > `DRIVER_PRICE_MIN_CENTS` | Platform ceiling |

**Notes:**
- Money is always stored and transmitted as integers in the smallest currency unit (paisas for PKR).
- The config loader rejects any environment where `DRIVER_PRICE_MAX_CENTS <= DRIVER_PRICE_MIN_CENTS`.

---

## 3. Subscription Commitment and Cancellation

> **Q6 — 1-month minimum, 7-day cancel notice. Confirmed by PRD F-05.**

| Parameter | Key | Type | Default | Valid range | Notes |
|-----------|-----|------|---------|-------------|-------|
| Minimum subscription term (days) | `SUBSCRIPTION_MIN_TERM_DAYS` | DB_CONFIG | `30` | 1–365 | PRD F-05 |
| Cancellation notice period (days) | `SUBSCRIPTION_CANCEL_NOTICE_DAYS` | DB_CONFIG | `7` | 0–30 | PRD F-05 |
| Grace period after failed payment before suspension (days) | `PAYMENT_GRACE_PERIOD_DAYS` | DB_CONFIG | `3` | 0–14 | TRD §10.3 |
| Maximum active subscriptions per rider | `MAX_SUBSCRIPTIONS_PER_RIDER` | DB_CONFIG | `2` | 1–10 | One AM + one PM in practice |

**Notes:**
- `DB_CONFIG` rows are stored in the `platform_config(key, value, updated_at)` table. The API reads them at startup and re-reads every 5 minutes (TTL cache). A redeploy is not required to change these values, but changes must go through the admin panel, not direct DB edits.
- `SUBSCRIPTION_MIN_TERM_DAYS` and `SUBSCRIPTION_CANCEL_NOTICE_DAYS` are in the DB so ops can adjust them for promotional periods without a deploy.

---

## 4. Platform Commission
 
> **Resolved 2026-08-25: 0% launch rate (0.00), dynamically backed by DB config for future adjustments.**

| Parameter | Key | Type | Default | Valid range | Notes |
|-----------|-----|------|---------|-------------|-------|
| Platform commission rate (fraction, e.g. 0.10 = 10%) | `PLATFORM_COMMISSION_RATE` | DB_CONFIG | `0.00` (0% at launch) | 0.0–0.5 | **LOCKED** (stored in `platform_config`) |

**Notes:**
- The MVP operates at 0% platform commission during launch to accelerate supply acquisition.
- **Architectural Requirement:** The payout and accounting calculation engine (TRD §10.4 / T1.47) must never hardcode a 0% rate. It dynamically reads `PLATFORM_COMMISSION_RATE` from `platform_config(key, value)` at runtime with a 5-minute TTL cache, so commission can be introduced or modified without any application redeploy or code change.
- Stripe Connect fee pass-through is tracked independently.

---

## 5. Background Check Policy

> **Q7 — Manual admin document review in MVP. Confirmed by PRD §15.2.**

| Parameter | Key | Type | Default | Notes |
|-----------|-----|------|---------|-------|
| Background check provider | `BACKGROUND_CHECK_PROVIDER` | ENV | `"manual"` | Only `"manual"` is valid in MVP. A future value `"checkr"` or `"truecaller"` triggers the Phase 2 adapter. |
| Documents required for approval | `REQUIRED_DRIVER_DOCUMENTS` | DB_CONFIG | `"cnic,license,vehicle_registration"` | Comma-separated document type codes. Admin cannot mark a driver as APPROVED if any listed document is missing or expired. |
| Document expiry warning days | `DOCUMENT_EXPIRY_WARNING_DAYS` | DB_CONFIG | `30` | Drivers receive a notification this many days before any document expires. |

**Notes:**
- No background check API integration is built in MVP. The admin panel surfaces document uploads (T0.38) and a manual approve/reject action (T1.56).
- The `REQUIRED_DRIVER_DOCUMENTS` list is DB-configurable so ops can add a new document type (e.g. "police_clearance") without a deploy.

---

## 6. Scoring Weights

> **T-10 — Scoring weights are constants in MVP. Admin-configurable weights are deferred to Phase 1.5.**

The TRD §4.1 Step 5 scoring formula weights are defined as constants in the matching service, not as configurable parameters. Rationale: configurable weights require a weights-management UI, a validation layer (weights must sum to 1.0), and a mechanism to propagate changes to the matching service without restart. None of this is cost-effective before the scoring formula has been empirically validated on real traffic.

| Weight | Symbol | Default value | Notes |
|--------|--------|---------------|-------|
| Rating weight | `W_RATING` | `0.40` | Driver's average rating |
| Acceptance rate weight | `W_ACCEPTANCE` | `0.30` | Historical acceptance rate |
| Subscriber count weight | `W_SUBSCRIBERS` | `0.30` | Number of active subscribers on route |

**Constraint:** `W_RATING + W_ACCEPTANCE + W_SUBSCRIBERS = 1.0`. The matching service validates this at startup.

**Revisit:** `T1.06` implements the scoring function. If empirical evidence from the first 30 days shows the weights need significant adjustment, admin-configurable weights become a Phase 1.5 item. A decision either way must be recorded in an ADR update.

---

## 7. Rate Limits

> **Defined in TRD §12.4. Expressed as parameters to allow adjustment without redeploy.**

| Limit | Key | Type | Default | Window |
|-------|-----|------|---------|--------|
| Auth endpoints (per IP) | `RATE_LIMIT_AUTH_PER_IP` | ENV | `5` | 10 minutes |
| OTP issue (per phone) | `RATE_LIMIT_OTP_PER_PHONE` | ENV | `3` | 5 minutes |
| Search (per authenticated user) | `RATE_LIMIT_SEARCH_PER_USER` | ENV | `30` | 1 minute |
| General API (per authenticated user) | `RATE_LIMIT_GENERAL_PER_USER` | ENV | `200` | 1 minute |

**Notes:**
- Rate limit state is stored in Redis with a key pattern `rl:{type}:{identifier}`.
- These are ENV variables so they can be adjusted in ECS task definitions without a code change or deploy. They are not DB_CONFIG because rate limiting must be applied before the database is reachable.

---

## 8. Operational Thresholds

| Parameter | Key | Type | Default | Notes |
|-----------|-----|------|---------|-------|
| Driver no-show strike limit before suspension | `DRIVER_STRIKE_LIMIT` | DB_CONFIG | `3` | TRD §10.5 |
| Strike reset period (days) | `DRIVER_STRIKE_RESET_DAYS` | DB_CONFIG | `90` | Strikes older than this are not counted |
| Max seat capacity per driver | `DRIVER_MAX_SEAT_CAPACITY` | ENV | `50` | Hard upper bound validated at onboarding |
| Search radius (metres) | `SEARCH_RADIUS_METRES` | DB_CONFIG | `500` | `ST_DWithin` radius in the candidate filter |
| Location update interval — active trip (seconds) | `LOCATION_EMIT_INTERVAL_ACTIVE` | ENV | `5` | TRD §6.1 |
| Location update interval — idle (seconds) | `LOCATION_EMIT_INTERVAL_IDLE` | ENV | `60` | Power saving when no active trip |
| Location distance filter (metres) | `LOCATION_DISTANCE_FILTER` | ENV | `20` | Suppress updates if driver hasn't moved this far |
| Location log retention (days) | `LOCATION_LOG_RETENTION_DAYS` | ENV | `30` | ADR-010 — hard purge after this period |
| In-app notification unread count cache TTL (seconds) | `NOTIFICATION_UNREAD_CACHE_TTL` | ENV | `10` | TRD §9.3 |
| Notification deduplication window (seconds) | `NOTIFICATION_DEDUPE_TTL` | ENV | `3600` | TRD §9.4 |
| Notification retry backoff (seconds, comma-separated) | `NOTIFICATION_RETRY_BACKOFF` | ENV | `1,10,60` | Three attempts |
| OTP TTL (seconds) | `OTP_TTL` | ENV | `300` | 5 minutes |
| OTP max attempts before lockout | `OTP_MAX_ATTEMPTS` | ENV | `3` | TRD §8.1 |
| OTP lockout duration (seconds) | `OTP_LOCKOUT` | ENV | `900` | 15 minutes |
| JWT access token TTL (seconds) | `JWT_ACCESS_TTL` | ENV | `900` | 15 minutes |
| Refresh token TTL (days) | `JWT_REFRESH_TTL_DAYS` | ENV | `30` | Stored as SHA-256 hash only |
| Pre-signed S3 URL TTL (seconds) | `S3_PRESIGNED_TTL` | ENV | `300` | 5 minutes |
| Max document upload size (bytes) | `MAX_DOCUMENT_SIZE_BYTES` | ENV | `10485760` | 10 MB |

---

## 9. External Service Configuration

| Parameter | Key | Type | Notes |
|-----------|-----|------|-------|
| Stripe publishable key | `STRIPE_PUBLISHABLE_KEY` | ENV | Public key, safe to expose to mobile |
| Stripe secret key | `STRIPE_SECRET_KEY` | ENV | **Secret — never log, never expose** |
| Stripe webhook secret | `STRIPE_WEBHOOK_SECRET` | ENV | **Secret — for signature verification** |
| Stripe Connect client ID | `STRIPE_CONNECT_CLIENT_ID` | ENV | For driver Connect onboarding |
| Twilio account SID | `TWILIO_ACCOUNT_SID` | ENV | SMS/OTP delivery |
| Twilio auth token | `TWILIO_AUTH_TOKEN` | ENV | **Secret** |
| Twilio from number | `TWILIO_FROM_NUMBER` | ENV | E.164 format |
| SendGrid API key | `SENDGRID_API_KEY` | ENV | Email notifications |
| FCM service account JSON | `FCM_SERVICE_ACCOUNT_JSON` | ENV | Base64-encoded JSON; parse at boot |
| Google Maps API key | `GOOGLE_MAPS_API_KEY` | ENV | Geocoding only |
| Google OAuth client ID | `GOOGLE_OAUTH_CLIENT_ID` | ENV | Server-side token exchange |
| Google OAuth client secret | `GOOGLE_OAUTH_CLIENT_SECRET` | ENV | **Secret** |
| Sentry DSN (API) | `SENTRY_DSN_API` | ENV | Error tracking |
| Sentry DSN (matching) | `SENTRY_DSN_MATCHING` | ENV | |
| OTel exporter endpoint | `OTEL_EXPORTER_OTLP_ENDPOINT` | ENV | OTel collector URL |

---

## 10. Open Questions Tracker
 
| ID | Question | Status / Decision | Resolution Date |
|----|----------|-------------------|-----------------|
| B6 | Launch market | **RESOLVED**: Karachi, Pakistan (PKR, Asia/Karachi, BBox 24.70–25.15 / 66.85–67.35) | 2026-08-25 |
| B7 | Regulatory & operator liability posture | **RESOLVED**: Pure Technology Marketplace; manual admin document verification | 2026-08-25 |
| Q1 | Driver price min/max | **RESOLVED**: Min PKR 5,000 / Max PKR 30,000 | 2026-08-25 |
| Q9 | Female-driver filter | **RESOLVED**: Deferred to Phase 2 (schema kept minimal for MVP) | 2026-08-25 |
| T-10 | Scoring weights configurability | Constants for MVP (0.40 / 0.30 / 0.30); revisit in Phase 1.5 | Pre-Phase 0 |

---

## `.env.example` mapping

The `T0.07` task creates `.env.example`. Every ENV-type parameter in this document must appear there with a placeholder value (never a real value). DB_CONFIG parameters do not appear in `.env.example` — they are seeded into the `platform_config` table by the seed script.

**Verification:** `grep -c "ENV" docs/platform-parameters.md` gives the count of ENV parameters. The `.env.example` must contain the same count of non-comment lines. This is asserted in `T0.07`'s verification step.

# Data Privacy Register — RouteRide MVP

> **Purpose:** Classify every field in the TRD v1.0 schema as Non-Personal / Personal / Sensitive. Assign a stated purpose, retention period, and deletion path to every personal or sensitive field. This register drives `T1.61` (GDPR/CCPA export and deletion) and must be walked against the migration-v1 schema field by field before Checkpoint D closes.
>
> **Classification:**
> - **NP** — Non-personal: no individual can be identified from this field alone or in combination.
> - **P** — Personal (PII): the field, alone or in combination, identifies or can identify a natural person.
> - **S** — Sensitive: a sub-category that requires heightened protection — health, finance, live location, government IDs, biometrics, or any data about a minor.
>
> **Retention notation:**
> - `ACTIVE` — retained while the account is active.
> - `+N days` — retained for N days after the triggering event (account deletion, trip end, etc.).
> - `PURGE` — hard-deleted (not soft-deleted) from all stores.
> - `ANONYMISE` — identifying fields removed; aggregate remains for analytics.
>
> **Dependency:** This register depends on `docs/regulatory-review.md` for the applicable privacy regime. Where the regime is still open (B6/B7), the register documents the minimum controls that apply regardless.

---

## Table 1: `users`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | Primary key; used in all cross-table joins | ACTIVE + 90 days | Anonymised to a random UUID on account deletion; all FK references updated or nulled |
| `phone` | P | Authentication (OTP), driver-to-consumer contact | ACTIVE | PURGE on account deletion |
| `full_name` | P | Display in UI, trip manifest | ACTIVE | PURGE on account deletion |
| `email` | P | Transactional notifications (optional) | ACTIVE | PURGE on account deletion |
| `password_hash` | P | Authentication — bcrypt hash only, never plaintext | ACTIVE | PURGE on account deletion |
| `role` | NP | Access control; no personal meaning alone | ACTIVE | No action required |
| `status` | NP | Account lifecycle state | ACTIVE | No action required |
| `preferred_language` | P | UI localisation | ACTIVE | PURGE on account deletion |
| `fcm_token` | P | Push notification routing (links device to user) | ACTIVE | PURGE on logout and on account deletion; cleared on UNREGISTERED FCM response |
| `stripe_customer_id` | P | Payment method storage; links to Stripe's data | ACTIVE | Send Stripe a customer-delete request on account deletion; PURGE locally |
| `created_at` | NP | Audit | ACTIVE + 90 days | PURGE after retention window |
| `updated_at` | NP | Audit | ACTIVE + 90 days | PURGE after retention window |

---

## Table 2: `driver_profiles`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target from `subscriptions`, `trips` | ACTIVE + 90 days | Anonymised on account deletion |
| `user_id` | P | Links driver profile to user | ACTIVE + 90 days | FK nulled after user anonymisation |
| `vehicle_make` | P | Displayed to consumers to identify the vehicle | ACTIVE | PURGE on account deletion |
| `vehicle_model` | P | As above | ACTIVE | PURGE on account deletion |
| `vehicle_year` | NP | Not personally identifying alone | ACTIVE | No action required |
| `vehicle_colour` | P | Vehicle identification | ACTIVE | PURGE on account deletion |
| `plate_number` | P | Unique vehicle identifier; could identify the driver | ACTIVE | PURGE on account deletion |
| `seat_capacity` | NP | Operational constraint | ACTIVE | No action required |
| `route_polyline` | P | Driver's daily route; reveals home/work area | ACTIVE | PURGE on account deletion |
| `base_price_cents` | NP | Not personally identifying | ACTIVE | No action required |
| `operating_days` | NP | Operational schedule | ACTIVE | No action required |
| `status` | NP | Verification state | ACTIVE | No action required |
| `acceptance_rate` | NP | Derived aggregate; no individual identifies from this | ACTIVE | No action required |
| `typical_departure_time` | P | Reveals routine; timing of daily movement | ACTIVE | PURGE on account deletion |
| `stripe_account_id` | P | Links to driver's Stripe Connect account | ACTIVE | Send Stripe a Connect account-delete/deauthorise request on account deletion; PURGE locally |
| `rating` | NP | Aggregate; no individual field | ACTIVE | No action required |
| `created_at` | NP | Audit | ACTIVE + 90 days | PURGE after retention window |

---

## Table 3: `riders`

> **Heightened sensitivity: riders are frequently minors. All personal fields in this table are treated as Sensitive (S).**

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | S | FK target; links to subscriptions and trips | ACTIVE + 90 days | Anonymised on consumer account deletion |
| `consumer_id` | S | Links rider to guardian | ACTIVE + 90 days | FK nulled after consumer anonymisation |
| `full_name` | S | Trip manifest; parent identification of child | ACTIVE | PURGE on rider deletion or consumer account deletion |
| `photo_s3_key` | S | Child's photo; used by driver to identify rider at pickup | ACTIVE | S3 object deleted on rider deletion or consumer account deletion; PURGE DB row |
| `pickup_address` | S | Child's daily pickup location (often home address) | ACTIVE | PURGE on rider deletion or consumer account deletion |
| `pickup_point` | S | `GEOGRAPHY(POINT)` — precise home location | ACTIVE | PURGE on rider deletion or consumer account deletion |
| `destination_address` | S | School address | ACTIVE | PURGE on rider deletion or consumer account deletion |
| `destination_point` | S | `GEOGRAPHY(POINT)` — precise school location | ACTIVE | PURGE on rider deletion or consumer account deletion |
| `direction` | NP | One-way / round-trip flag | ACTIVE | No action required |
| `emergency_contact_name` | S | Emergency contact for the child | ACTIVE | PURGE on rider deletion or consumer account deletion |
| `emergency_contact_phone` | S | Emergency contact phone | ACTIVE | PURGE on rider deletion or consumer account deletion |
| `created_at` | NP | Audit | ACTIVE + 90 days | PURGE after retention window |
| `updated_at` | NP | Audit | ACTIVE + 90 days | PURGE after retention window |

---

## Table 4: `subscriptions`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target | ACTIVE + 7 years | Retained for financial audit |
| `rider_id` | P | Links subscription to rider | ACTIVE + 7 years | Cannot be purged while financial records reference it; anonymised after retention period |
| `driver_profile_id` | P | Links to driver | ACTIVE + 7 years | As above |
| `status` | NP | Lifecycle state | ACTIVE + 7 years | Retain for audit |
| `price_at_subscription_cents` | NP | Financial record | ACTIVE + 7 years | Retain for audit |
| `start_date` | NP | Financial record | ACTIVE + 7 years | Retain for audit |
| `end_date` | NP | Financial record | ACTIVE + 7 years | Retain for audit |
| `cancellation_reason` | P | May contain user-typed text; could be personal | ACTIVE + 7 years | Anonymise after account deletion; keep for financial audit |
| `created_at` | NP | Audit | ACTIVE + 7 years | Retain for audit |

**Note:** Financial records have a 7-year retention minimum in most jurisdictions. Personal fields within financial records are anonymised (name replaced with "Deleted User {hash}") rather than purged after account deletion. The financial record structure is retained.

---

## Table 5: `trips`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target from `location_logs` | ACTIVE + 90 days | Anonymised after retention period |
| `subscription_id` | P | Links trip to subscription | ACTIVE + 7 years | FK to financial record; see subscriptions retention |
| `driver_profile_id` | P | Trip manifest | ACTIVE + 7 years | As above |
| `trip_date` | NP | When the trip occurred | ACTIVE + 7 years | Financial record |
| `status` | NP | Trip state machine | ACTIVE + 7 years | Retain for audit |
| `started_at` | NP | Trip timing | ACTIVE + 7 years | Retain for audit |
| `completed_at` | NP | Trip timing | ACTIVE + 7 years | Retain for audit |
| `location_log_id` | P | FK to live location log | ACTIVE; FK becomes null after 30 days | PURGE location_log after 30 days (ADR-010); FK set to NULL |
| `pickup_order` | NP | Scheduling optimisation artifact | ACTIVE + 90 days | PURGE after retention window |
| `deviation_alert_sent` | NP | Operational flag | ACTIVE + 90 days | PURGE after retention window |

---

## Table 6: `location_logs`

> **Highest sensitivity: live location data for active trips carrying minors.**

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | S | FK from `trips.location_log_id` | 30 days | PURGE — hard delete from Postgres and all backups after 30 days |
| `trip_id` | S | Links location record to trip | 30 days | PURGE with parent row |
| `driver_user_id` | S | Location attribution | 30 days | PURGE with parent row |
| `latitude` | S | Precise driver location during a child's transport | 30 days | PURGE — hard delete (ADR-010) |
| `longitude` | S | As above | 30 days | PURGE — hard delete |
| `heading` | NP | Navigation display only | 30 days | PURGE with parent row |
| `speed_kmh` | NP | Navigation display only | 30 days | PURGE with parent row |
| `recorded_at` | S | Timing of child's location | 30 days | PURGE — hard delete |

**ADR-010 rationale:** The cheapest location data to protect against a breach is the data that no longer exists. Thirty days covers the window in which a parent might need to verify a historical trip. No replay or analytics use case in MVP requires longer retention. The purge job runs nightly (T1.32); it deletes rows from `location_logs` where `recorded_at < NOW() - 30 days`, then nulls the FK in `trips`.

**Backup implication:** Database backups are retained for 7 days (RDS automated backup window). A location record purged from the live database will persist in the most recent backups for up to 7 days. This is documented and accepted. If a data-subject deletion request is received, backups that contain that user's location data must be identified and the request noted — full backup deletion is an extreme measure; document the legal basis for the 7-day backup retention in `docs/regulatory-review.md` §4.

---

## Table 7: `payments`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | Financial record | 7 years | Retain for financial audit |
| `subscription_id` | P | Links payment to subscription | 7 years | As above |
| `amount_cents` | NP | Financial record | 7 years | Retain |
| `currency` | NP | Financial record | 7 years | Retain |
| `status` | NP | Payment outcome | 7 years | Retain |
| `stripe_payment_intent_id` | P | Links to Stripe's records; could identify a person | 7 years | Anonymise on account deletion; retain for audit |
| `idempotency_key` | NP | Derived from `(subscriptionId, billingDate)`; not personal alone | 7 years | Retain for audit |
| `created_at` | NP | Financial record | 7 years | Retain |

---

## Table 8: `payment_methods`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target | ACTIVE | PURGE on account deletion |
| `user_id` | P | Links to user | ACTIVE | FK nulled after purge |
| `stripe_payment_method_id` | P | References Stripe's stored card; could identify person | ACTIVE | Detach from Stripe customer before PURGE; PURGE locally on account deletion |
| `last_four` | P | Card identification for UI (not a payment instrument) | ACTIVE | PURGE on account deletion |
| `brand` | NP | Card brand (Visa, Mastercard) | ACTIVE | No action required |
| `exp_month` | P | Card expiry; combined with last_four identifies the card | ACTIVE | PURGE on account deletion |
| `exp_year` | P | As above | ACTIVE | PURGE on account deletion |
| `is_default` | NP | Operational flag | ACTIVE | No action required |
| `created_at` | NP | Audit | ACTIVE + 90 days | PURGE after retention window |

---

## Table 9: `driver_payouts`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | Financial record | 7 years | Retain |
| `driver_profile_id` | P | Financial record | 7 years | Anonymise on account deletion; retain for audit |
| `period_start` / `period_end` | NP | Financial record | 7 years | Retain |
| `gross_amount_cents` | NP | Financial record | 7 years | Retain |
| `commission_cents` | NP | Financial record | 7 years | Retain |
| `net_amount_cents` | NP | Financial record | 7 years | Retain |
| `stripe_transfer_id` | P | Links to Stripe transfer | 7 years | Anonymise on account deletion; retain for audit |
| `status` | NP | Financial record | 7 years | Retain |
| `created_at` | NP | Financial record | 7 years | Retain |

---

## Table 10: `driver_documents`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target | ACTIVE + 30 days | PURGE after account deletion + retention period |
| `driver_profile_id` | P | Links to driver | ACTIVE + 30 days | FK nulled after PURGE |
| `document_type` | NP | Classification only | ACTIVE + 30 days | PURGE with parent |
| `s3_key` | P | Points to S3 object containing identity document (CNIC, licence) | ACTIVE + 30 days | S3 object deleted; PURGE DB row on account deletion |
| `status` | NP | Verification state | ACTIVE + 30 days | PURGE with parent |
| `expiry_date` | P | Document expiry; reveals document number proximity | ACTIVE + 30 days | PURGE with parent |
| `uploaded_at` | NP | Audit | ACTIVE + 30 days | PURGE with parent |

**Note:** Government-issued identity documents (CNIC, driver's licence) are Sensitive by classification. They are stored only in S3 (private bucket, pre-signed GET for admins only) and are never returned in API responses except as pre-signed URLs with 5-minute TTL.

---

## Table 11: `notifications`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target | ACTIVE + 90 days | PURGE after retention window |
| `user_id` | P | Notification routing | ACTIVE + 90 days | PURGE after account deletion |
| `type` | NP | Notification category | ACTIVE + 90 days | PURGE with parent |
| `title` | P | May contain user's name or trip details | ACTIVE + 90 days | PURGE after account deletion |
| `body` | P | As above | ACTIVE + 90 days | PURGE after account deletion |
| `entity_id` / `entity_type` | P | Links to a trip or subscription | ACTIVE + 90 days | PURGE after account deletion |
| `is_read` | NP | UI state | ACTIVE + 90 days | PURGE with parent |
| `created_at` | NP | Audit | ACTIVE + 90 days | PURGE after retention window |

---

## Table 12: `refresh_tokens`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | Row identifier | TTL = JWT_REFRESH_TTL_DAYS | PURGE on logout, revocation, and account deletion |
| `token_hash` | P | SHA-256 hash of the refresh token (not the token itself) | TTL = JWT_REFRESH_TTL_DAYS | PURGE — never store the plaintext token |
| `user_id` | P | Links to user | TTL = JWT_REFRESH_TTL_DAYS | PURGE on account deletion |
| `expires_at` | NP | TTL management | TTL = JWT_REFRESH_TTL_DAYS | PURGE with parent |
| `revoked_at` | NP | Audit of revocation | TTL + 30 days | PURGE after audit window |
| `created_at` | NP | Audit | TTL + 30 days | PURGE after audit window |

---

## Table 13: `driver_schedule_slots`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target | ACTIVE | PURGE on account deletion |
| `driver_profile_id` | P | Links to driver | ACTIVE | FK nulled on account deletion |
| `day_of_week` | NP | Scheduling | ACTIVE | PURGE with parent |
| `window_start` / `window_end` | NP | Schedule window; not personal alone | ACTIVE | PURGE with parent |
| `subscription_id` | P | Links to financial record | ACTIVE | FK nulled; retain subscription record per §4 |

---

## Table 14: `support_tickets`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target | 2 years | Retain for dispute resolution |
| `user_id` | P | Links ticket to user | 2 years | Anonymise on account deletion; retain for audit |
| `type` | NP | Classification | 2 years | Retain |
| `description` | P | User-typed; may contain personal information | 2 years | Anonymise on account deletion |
| `status` | NP | Ticket lifecycle | 2 years | Retain |
| `created_at` | NP | Audit | 2 years | Retain |

---

## Table 15: `reviews`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target | 2 years | Retain for trust/safety purposes |
| `reviewer_id` / `reviewee_id` | P | Links to user accounts | 2 years | Anonymise on account deletion; retain aggregate for safety |
| `subscription_id` | P | Verified review attribution | 2 years | FK nulled on subscription anonymisation |
| `rating` | NP | Aggregate; numerical | 2 years | Retain |
| `comment` | P | May contain personal information | 2 years | Anonymise on account deletion |
| `created_at` | NP | Audit | 2 years | Retain |

---

## Table 16: `messages`

| Column | Class | Purpose | Retention | Deletion path |
|--------|-------|---------|-----------|---------------|
| `id` (UUID) | P | FK target | 90 days | PURGE after retention window (TRD §9.5 / messaging spec) |
| `sender_id` / `recipient_id` | P | Message routing | 90 days | PURGE after retention window |
| `subscription_id` | P | Conversation context | 90 days | PURGE with message |
| `body` | P | Message content; personal by nature | 90 days | PURGE — hard delete after 90 days |
| `created_at` | NP | Audit | 90 days | PURGE with parent |

---

## Non-Database Stores

| Store | Data held | Retention | Deletion path |
|-------|-----------|-----------|---------------|
| **Redis** | Rate limit counters, OTP hashes, session data, unread notification counts, driver location cache | TTL per key type (max 24h for most; OTP 5min; location 30s) | Keys expire automatically; on account deletion, `DEL` all user-keyed entries |
| **S3 (documents bucket)** | Driver identity documents, vehicle registration, licences | ACTIVE + 30 days post-deletion | `s3:DeleteObject` called on account deletion and document replacement; bucket has no public access |
| **S3 (assets bucket)** | Rider photos, driver profile photos | ACTIVE + 30 days post-deletion | `s3:DeleteObject` on account deletion |
| **Application logs** | Structured JSON; coordinates rounded to 2dp; no passwords/tokens/OTPs per T0.16 | 30 days (CloudWatch default) | Log group TTL; no action needed if redaction is in place |
| **Sentry (error tracking)** | Stack traces, request context; must not contain PII per T0.16 redaction | 90 days (Sentry default) | Sentry data-scrubbing rules for any PII that leaks; review quarterly |
| **OTel traces** | Request traces with `requestId` and `userId`; coordinates rounded to 2dp | 30 days | OTel collector TTL |
| **Database backups (RDS)** | Full database snapshot including all personal data | 7 days | RDS automated backup expiry; no individual purge possible within backup window |

**Backup note:** A deletion or purge request for an individual's data cannot be honoured for the backup window (7 days). After 7 days the backup expires and the data is gone. Document this lag in the privacy policy and in the response to any DSAR.

---

## Verification Checklist

Before Checkpoint D closes, walk this register against the migration-v1 schema (`apps/api/prisma/schema.prisma` + the PostGIS migration) column by column:

- [ ] Every column in every table has a row in this register.
- [ ] No column is unclassified (every row has a Class of NP, P, or S).
- [ ] Every P or S row has a stated purpose.
- [ ] Every P or S row has a retention period.
- [ ] Every P or S row has a named deletion path.
- [ ] No P or S field is collected without a purpose (purpose column is not "TBD" or blank).
- [ ] All S-class fields involving children (riders table) are flagged heightened sensitivity.
- [ ] Redis, S3, logs, Sentry, and backups are all covered in the non-database stores section.
- [ ] Financial record retention (7 years) is applied to `payments`, `driver_payouts`, `subscriptions`.
- [ ] Location log retention (30 days hard purge) matches ADR-010.

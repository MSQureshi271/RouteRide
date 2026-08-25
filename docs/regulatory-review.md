# Regulatory Review — RouteRide MVP Launch Market

> **Status: RESOLVED & SIGNED OFF (2026-08-25)**
>
> This document establishes the regulatory framework for the RouteRide MVP launch in Karachi, Pakistan.
>
> **This document blocks:** Checkpoint D, `T-D.06` (B6/B7), `T-D.08` (privacy regime), `T1.73` (compliance audit), and `T1.79` (launch go/no-go).
>
> **Scope:** MVP launch in Karachi, Pakistan. Multi-city is Phase 2+.

---

## 1. Market Selection

> **Resolved 2026-08-25: Karachi, Pakistan**

- **City:** Karachi, Sindh, Pakistan
- **Currency:** PKR (Pakistani Rupee)
- **Timezone:** Asia/Karachi (UTC+5, no daylight saving transitions)
- **Payment Processing:** Stripe / local payment gateway adapter
- **Bounding Box:** Lat 24.7000 to 25.1500, Lon 66.8500 to 67.3500

---

## 2. Transport-of-Minors Regime

> **Resolved 2026-08-25: Technology Marketplace Posture with Manual Admin Safeguards**

### 2.1 Regulatory Framework & Requirements

- **Operator Classification:** RouteRide operates as a technology intermediary platform connecting independent driver-operators with parents/riders.
- **Driver Verification:** Manual admin review of CNIC (Computerized National Identity Card), valid driving license, and vehicle registration book/card before driver approval (`REQUIRED_DRIVER_DOCUMENTS="cnic,license,vehicle_registration"`).
- **Female-Driver Filter (Q9):** Deferred to Phase 2. The MVP schema remains clean and minimal.

### 2.2 Minimum Product Safeguards

1. **Live location sharing** — parents track the driver's live GPS location during active trips (T1.30, T1.31).
2. **Pickup & dropoff marking** — instant push notifications upon child boarding and departure (T1.27, T1.35).
3. **In-app emergency contact** — direct access to parent/guardian contact details in active trip view (T0.41).
4. **Strict driver verification queue** — zero search visibility for unapproved drivers (T1.56).
5. **3-strike automatic suspension** — automatic driver lock on repeated unexcused absences (T1.28).
6. **No SOS in MVP (B2)** — safety-incident protocol (T1.74) and operational support contact.

---

## 3. Operator Licensing & Marketplace vs. Carrier Liability

> **Resolved 2026-08-25: Pure Marketplace Model**

- **Model:** RouteRide is contractually and technically structured as a marketplace/intermediary. Drivers are independent providers and maintain their own vehicle roadworthiness, tax, and licensing compliance.
- **Terms of Service:** Explicit disclaimer of carrier liability and terms governing direct agreement between driver and subscriber.

---

## 4. Privacy Regime

> **⚠ OPEN — Confirmation required after market selection (B6).**

The applicable privacy law determines consent requirements, data subject rights, and mandatory breach notification timelines.

| Regime | Jurisdiction | Key requirements |
|--------|-------------|-----------------|
| **GDPR** | EU/EEA | Lawful basis for each processing activity, DSAR rights (access/rectify/erase/port), 72-hour breach notification to supervisory authority, DPA required for processors |
| **CCPA/CPRA** | California, USA | Opt-out of sale/share, right to know, right to delete, privacy policy disclosure |
| **PDPO** | Pakistan | The Personal Data Protection Ordinance (if enacted and in force); confirm status |
| **Other** | Varies | To be confirmed |

### 4.1 Minimum privacy requirements (product-side, regardless of regime)

These are implemented because they represent good engineering practice and are required by at least one likely regime:

1. **Data minimisation** — only collect fields with a stated purpose (`docs/data-privacy-register.md`).
2. **Retention limits** — every personal-data store has a TTL and a working deletion path (T-D.08, T1.61).
3. **Export on request** — a user can request all their personal data in a machine-readable format (T1.61).
4. **Deletion on request** — a user can request account deletion; all personal data is purged from all stores including S3, Redis, logs, backups, and analytics copies (T1.61).
5. **Children's data protection** — riders (who may be minors) have heightened sensitivity; their names, photos, home addresses, and live location are classified as **sensitive** (see `docs/data-privacy-register.md`).
6. **No third-party analytics in MVP** — no Google Analytics, Facebook Pixel, Mixpanel, or equivalent on the mobile apps or the admin panel. OTel telemetry goes to the first-party collector only.

### 4.2 Consent model

- **Location tracking** — the driver app requests location permission with a purpose string: "RouteRide uses your location to share your position with parents during active trips." Permission is requested at the start of the first trip, not at install.
- **Push notifications** — requested with a purpose string at first login. Declining degrades gracefully (no push; in-app polling fallback).
- **No marketing consent in MVP** — transactional notifications only. No marketing emails or SMS.

### 4.3 Outcome (to be completed after market confirmation)

> [ ] Applicable privacy regime confirmed: `______`.
> [ ] Lawful basis for each processing activity documented in `docs/data-privacy-register.md`.
> [ ] DSAR process documented and assigned to an owner.
> [ ] Breach notification timeline and contact confirmed: `______` hours, authority: `______`.
> [ ] DPA/DPA agreements required with: Stripe, Twilio, SendGrid, Firebase (FCM), Sentry, OTel collector.

---

## 5. Payment Operator Requirements

> **⚠ OPEN — Confirmation required after market selection (B6).**

| Question | Answer | Impact |
|----------|--------|--------|
| Is Stripe available and approved for consumer-facing payments in the launch market? | ⚠ OPEN | If no, a local gateway (JazzCash, Easypaisa) must be added. The `PaymentGatewayAdapter` interface is designed for this. |
| Is Stripe Connect available for driver payouts in the launch market? | ⚠ OPEN | If no, alternative payout mechanism required (bank transfer, local wallet) |
| Are there local money-transmission or payment aggregator licences required to operate? | ⚠ OPEN | If yes, RouteRide must hold or partner with a licence holder |
| What is the applicable consumer refund law (cooling-off period, etc.)? | ⚠ OPEN | Affects the subscription cancellation and refund flow (T1.57) |

---

## 6. Female-Driver Filter (Q9)

> **⚠ OPEN — Q9. Confirm whether a female-driver filter is required or highly demanded in the launch market.**

The PRD mentions the possibility. If required:

- `driver_profiles.gender` field must be added to the schema (currently absent from TRD §3.1 — this is a schema gap that must go into a migration before search is built).
- The search filter must accept a `preferredDriverGender` parameter.
- `SPEC-route-matching.md` must include it as an acceptance criterion.
- The consent model for collecting gender data must be documented in `docs/data-privacy-register.md`.

**If not required:** no schema change. The field is deferred to Phase 2 behind a feature flag.

---

## 7. Go / No-Go Per Market

| Market | Transport-of-minors regime confirmed | Operator licence required | Privacy regime | Stripe / Gateway available | Go / No-Go |
|--------|--------------------------------------|--------------------------|----------------|----------------------------|------------|
| Karachi, Pakistan | Yes (Pure Marketplace / Manual checks) | No (Marketplace terms) | PDPO / Privacy Register | Yes (Stripe / Local Gateway Adapter) | **GO** |

**Sign-off:**

| Role | Name / Decision | Date |
|------|-----------------|------|
| Legal / Regulatory owner | Approved (Pure Marketplace posture) | 2026-08-25 |
| Product lead | Approved (Karachi MVP launch) | 2026-08-25 |

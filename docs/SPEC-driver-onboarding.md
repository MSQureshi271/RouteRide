# SPEC: driver-onboarding

## Service-area amendment (current)

Scope delta: [B6](SPEC-DELTA-mvp.md) and [ADR-011](decisions/ADR-011-service-area-discovery-and-driver-acceptance.md). Implementation tasks: A1.01-A1.04 in the [Phase 1A amendment](../tasks/PHASE1A-service-area-amendment.md).

- A personal service area is required; a preset route is optional. A fully verified driver with a service area, starting location, recurring days/time intervals, capacity and price can become discoverable without an established route. Availability intervals are not tied to commute segments.
- Validate the declared service area independently of any route and require both commute endpoints inside it, including its boundary. Platform launch bounds also cap discovery. Legacy profiles flagged for setup remain undiscoverable until their required area, schedule and starting location are saved.
- Distinguish intentionally route-free from invalid established geometry. Validate any supplied geometry; approval/document checks remain mandatory.
- First acceptance establishes a recurring run; later acceptances can modify it only while preserving existing commitments. Availability/coverage edits cannot silently strand accepted riders.
- Verify onboarding with and without a route, invalid area/geometry rejection, optional-route public profiles and safe edits/backfill with existing subscriptions.

The requirements below remain applicable except where replaced by this section.

> **Module ID:** `driver-onboarding`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`driver-onboarding`)

---

## 1. Objective

Provide the full driver registration, profile creation, vehicle document upload (CNIC, Driving License, Vehicle Registration), optional route polyline and service-area geometry, recurring availability intervals, capacity definition (e.g. 4-12 seats), monthly pricing setup within platform limits, and review status workflow (`PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`).

### User Personas
- **Driver:** Submits personal details, vehicle data, encrypted document scans to S3, sets availability and a starting location, and may optionally declare service coverage or an initial route.
- **Admin Reviewer:** Inspects uploaded documents in the Admin Panel and approves/rejects driver profiles before they are discoverable in search.

---

## 2. Commands

```bash
# Test driver-onboarding module
pnpm --filter api test -- src/modules/driver-onboarding
pnpm --filter api test:integration -- test/driver-onboarding.integration.test.ts
```

---

## 3. Project Structure

```
apps/api/src/modules/driver-onboarding/
├── driver-onboarding.controller.ts # Driver profile, vehicle, and document endpoints
├── driver-onboarding.service.ts    # Onboarding lifecycle, document verification checks
├── s3-document.service.ts          # Presigned S3 PUT/GET generation with SSE-KMS
├── route-geometry.service.ts       # GeoJSON/Polyline encoding & PostGIS LineString conversion
└── dto/                            # Onboarding DTOs (Vehicle, Document, Route, Pricing)
```

---

## 4. Code Style & Rules

- **Document Storage:** Documents stored in private S3 bucket with SSE-KMS encryption. Drivers receive presigned PUT URLs with 15-minute TTL.
- **Search Invariant:** Drivers with status other than `APPROVED` MUST NOT appear in route search results under any condition.
- **Pricing Boundaries:** `monthly_price_cents` must fall strictly within `[DRIVER_PRICE_MIN_CENTS, DRIVER_PRICE_MAX_CENTS]` defined in `packages/config`.
- **Geometry:** Route polylines stored as PostGIS `GEOGRAPHY(LineString, 4326)` with GIST index `idx_dp_route`.

---

## 5. Testing Strategy

- **Unit Tests:** Price range validation, document type allowlist validation, route point count limits (min 2, max 100).
- **Integration Tests:**
  - Full onboarding workflow: Create profile -> Add vehicle -> Upload documents -> Set availability and starting location -> Optionally declare a service area or save a route -> Submit for review.
  - S3 Presigned URL generation and access restriction.
  - Verification state transitions (`DRAFT` -> `SUBMITTED` -> `APPROVED`).

---

## 6. Boundaries & Non-Goals

### In Scope
- Driver personal and vehicle registration.
- Document upload to private S3 bucket.
- Route geometry and schedule definition.
- Pricing and seat capacity limits.

### Non-Goals (Out of Scope)
- Automated external government background check API (handled via manual Admin review per Q7).
- Instant approval without document submission.

---

## 7. Success Criteria

1. Driver can complete profile submission with valid vehicle, service-area, starting-location and availability data, with or without a preset route.
2. Route polyline correctly persists in PostGIS as a valid LineString geography.
3. Unapproved drivers are completely omitted from public matching queries.
4. Document files over 10MB or invalid MIME types (e.g. executable files) are rejected at boundary.

---

## 8. Open Questions & Known Gaps

- *Resolved in Q7 & regulatory review:* Manual document inspection by admin is the required model for Karachi launch.

# SPEC: driver-onboarding

> **Module ID:** `driver-onboarding`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`driver-onboarding`)

---

## 1. Objective

Provide the full driver registration, profile creation, vehicle document upload (CNIC, Driving License, Vehicle Registration), route polyline geometry definition, schedule configuration (morning/afternoon departure times), capacity definition (e.g. 4-12 seats), monthly pricing setup within platform limits, and review status workflow (`PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`).

### User Personas
- **Driver:** Submits personal details, vehicle data, encrypted document scans to S3, and defines the recurring school route.
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
  - Full onboarding workflow: Create profile -> Add vehicle -> Upload documents -> Save route -> Submit for review.
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

1. Driver can complete profile submission with valid vehicle and route data.
2. Route polyline correctly persists in PostGIS as a valid LineString geography.
3. Unapproved drivers are completely omitted from public matching queries.
4. Document files over 10MB or invalid MIME types (e.g. executable files) are rejected at boundary.

---

## 8. Open Questions & Known Gaps

- *Resolved in Q7 & regulatory review:* Manual document inspection by admin is the required model for Karachi launch.

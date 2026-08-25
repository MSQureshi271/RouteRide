# SPEC: reviews

> **Module ID:** `reviews`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`reviews`)

---

## 1. Objective

Provide mutual, verified rating and review capabilities between parents and drivers at the conclusion of completed monthly subscription cycles or completed trips. Calculate aggregate driver rating scores (1.00 to 5.00 stars) that directly feed into the search rank algorithm in the `route-matching` service.

### User Personas
- **Consumer:** Rates driver punctuality, vehicle condition, and child safety attitude with 1-5 stars + optional comment.
- **Driver:** Rates consumer passenger readiness and respectful communication.

---

## 2. Commands

```bash
# Test reviews module
pnpm --filter api test -- src/modules/reviews
pnpm --filter api test:integration -- test/reviews.integration.test.ts
```

---

## 3. Project Structure

```
apps/api/src/modules/reviews/
├── reviews.controller.ts           # Submit review, list reviews API
├── reviews.service.ts              # Verified relationship verification & rating aggregation
└── dto/                            # Review submission & summary DTOs
```

---

## 4. Code Style & Rules

- **Verified-Only Invariant:** A user can ONLY review a party with whom they completed at least one verified subscription billing cycle or trip run. Unverified reviews are completely prohibited.
- **Single Review Per Cycle:** Exactly one review permitted per party per subscription month (enforced via database unique constraint `[subscription_id, reviewer_id, cycle_month]`).
- **Rating Aggregates:** Driver average rating is recalculated transactionally and stored in `driver_profiles.rating_average` (precision: 2 decimal places).

---

## 5. Testing Strategy

- **Unit Tests:** Star rating range validation (1 <= rating <= 5, integer), comment length limit (max 500 characters).
- **Integration Tests:**
  - Submit review after completed subscription -> Driver average rating updates correctly.
  - Attempt duplicate review for the same month -> `409 Conflict`.
  - Attempt review without verified relationship -> `403 Forbidden`.

---

## 6. Boundaries & Non-Goals

### In Scope
- 1-to-5 star ratings with optional written feedback.
- Aggregate rating recalculation.
- Public display of driver rating on profile and search cards.

### Non-Goals (Out of Scope)
- Public consumer ratings (consumer ratings are internal/driver-visible only).
- Video/photo review attachments.

---

## 7. Success Criteria

1. Verified parents and drivers can submit monthly reviews.
2. Unverified users cannot submit reviews.
3. Driver average rating updates immediately and is accurately reflected in matching rank scores.
4. Database unique constraint prevents duplicate review submissions.

---

## 8. Open Questions & Known Gaps

- *Resolved:* Verified-only restriction prevents spam reviews and rating manipulation.

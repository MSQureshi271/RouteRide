# SPEC: consumer-riders

> **Module ID:** `consumer-riders`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`consumer-riders`)

---

## 1. Objective

Provide consumer (parent) profile management, emergency contact details, and student/rider CRUD (first name, school name, grade/class, home pickup point, school dropoff point, special notes). Ensure strict parent-child ownership boundaries and geocoding validation.

### User Personas
- **Parent / Guardian:** Sets up home address, emergency contacts, and registers one or more children for recurring school transport.

---

## 2. Commands

```bash
# Test consumer-riders module
pnpm --filter api test -- src/modules/consumer-riders
pnpm --filter api test:integration -- test/consumer-riders.integration.test.ts
```

---

## 3. Project Structure

```
apps/api/src/modules/consumer-riders/
├── consumer.controller.ts          # Parent profile & emergency contact API
├── riders.controller.ts            # Rider CRUD endpoints
├── consumer-riders.service.ts      # Business logic & ownership verification
├── geocoding.service.ts            # Address geocoding validation & bounding box checks
└── dto/                            # Rider create/update DTOs
```

---

## 4. Code Style & Rules

- **Ownership:** Every rider query and mutation MUST verify `rider.consumerId === req.user.id`. Accessing a foreign rider throws `403 Forbidden`.
- **Location Constraints:** Pickup and dropoff points must lie within the bounding box of the active launch city (`LAUNCH_CITY_BBOX_*`).
- **Data Minimization:** No national ID numbers or birth certificates required for children in MVP.

---

## 5. Testing Strategy

- **Unit Tests:** DTO validation, bounding box coordinate validator, school name formatting.
- **Integration Tests:**
  - Create consumer -> Add 2 riders -> Query riders list -> Update pickup location -> Delete rider.
  - Ownership test: Consumer B attempting to view or update Consumer A's rider receives `403 Forbidden`.

---

## 6. Boundaries & Non-Goals

### In Scope
- Parent profile details & emergency contact numbers.
- Multiple rider creation per consumer account.
- Point-of-interest geocoded pickup and dropoff points (PostGIS `GEOGRAPHY(Point, 4326)`).

### Non-Goals (Out of Scope)
- Student direct logins (students do not have user accounts in MVP).
- Real-time guardian sharing / split-custody multi-parent links (Phase 2).

---

## 7. Success Criteria

1. Parent can create and retrieve riders with valid coordinates within Karachi.
2. Coordinates outside Karachi city boundaries are rejected with `400 BAD_REQUEST`.
3. Foreign user rider access attempts are rejected with `403 FORBIDDEN`.
4. Deleting a rider with active subscriptions is rejected with `409 CONFLICT`.

---

## 8. Open Questions & Known Gaps

- *Resolved in platform-parameters.md:* Karachi bounding box coordinates strictly enforced.

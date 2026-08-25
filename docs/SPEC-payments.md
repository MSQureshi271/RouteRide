# SPEC: payments

> **Module ID:** `payments`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`payments`)

---

## 1. Objective

Provide secure, idempotent recurring billing and driver payout processing. Support card tokenization via Stripe Elements / Payment Methods, recurring monthly charges via Stripe `PaymentIntents` (manual platform-side charge per ADR-006), webhook signature verification, driver Stripe Connect account onboarding, dynamic platform commission calculation (from `platform_config` table, 0% launch rate per B6/B7), automated PDF receipts, and manual refund issuance.

### User Personas
- **Consumer:** Adds payment card, reviews monthly charges, downloads invoices.
- **Driver:** Completes Stripe Connect onboarding, views payout breakdown (gross fare minus platform fee), receives automated monthly bank payouts.
- **Admin:** Manages platform fee configuration, triggers manual refunds, and reviews transaction logs.

---

## 2. Commands

```bash
# Test payments module
pnpm --filter api test -- src/modules/payments
pnpm --filter api test:integration -- test/payments.integration.test.ts
```

---

## 3. Project Structure

```
apps/api/src/modules/payments/
├── payments.controller.ts          # Payment methods, checkout, and invoice endpoints
├── webhooks.controller.ts          # Stripe webhook receiver (raw body signature check)
├── billing.service.ts              # Monthly billing execution & payment intent creator
├── stripe-connect.service.ts       # Driver onboarding and transfer payouts
├── commission.service.ts           # Dynamic commission calculation from platform_config
├── receipts.service.ts             # PDF invoice receipt generator
└── dto/                            # Payment DTOs & webhook event schemas
```

---

## 4. Code Style & Rules

- **Money Precision:** All monetary amounts MUST be represented as positive integers in minor units (`cents` / `paisas`). No floating-point math.
- **Dynamic Commission:** Platform commission MUST NOT be hardcoded. Query `platform_config.commission_rate` dynamically with 5-minute cache TTL.
- **Webhook Security:** Webhooks MUST verify the `Stripe-Signature` header using the raw request body before processing.
- **Idempotency:** Every payment transaction, transfer, and webhook execution records a unique idempotency key in the database with a unique constraint.

---

## 5. Testing Strategy

- **Unit Tests:** Commission calculations (0% launch rate gives gross = net, 10% fee calculates correct split), integer rounding guarantees.
- **Integration Tests:**
  - Mocked Stripe webhook handling (`payment_intent.succeeded`, `payment_intent.payment_failed`).
  - Webhook signature validation test: Modified payload signature is rejected with `400 Bad Request`.
  - Duplicate webhook delivery idempotency test: Second delivery does not duplicate subscription invoice or driver credit.

---

## 6. Boundaries & Non-Goals

### In Scope
- Stripe PaymentIntents recurring monthly charge engine.
- Stripe Connect Custom/Express driver payouts.
- Dynamic commission lookup from DB config.
- Tax/invoice receipt generation.

### Non-Goals (Out of Scope)
- Direct Stripe Subscriptions product API (manual platform-side charge chosen per ADR-006 to allow future local gateway fallback).
- In-app cash payments (all transactions card-backed in MVP).

---

## 7. Success Criteria

1. Card attachment via Stripe PaymentMethods completes successfully with zero card details touching RouteRide servers.
2. Monthly billing job charges active subscriptions and creates invoice records.
3. Webhooks with invalid signatures are rejected immediately.
4. Idempotency guarantees prevent duplicate charges under all network retry scenarios.

---

## 8. Open Questions & Known Gaps

- *Resolved in ADR-006 & docs/platform-parameters.md:* Stripe PaymentIntents selected; 0% launch commission backed by `platform_config`.

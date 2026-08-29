# ADR-006: Stripe PaymentIntents (Platform-Driven Billing) vs Stripe Subscriptions

## Status

Accepted

## Date

2026-08-25

## Context

RouteRide operates a monthly recurring school/work ride subscription marketplace. Under TRD §10.1, the billing lifecycle involves:

- Upfront monthly charges per seat.
- Prorated seat cancellations and pause adjustments.
- Multi-party split payments: platform fee (15%), driver payout (85%), and escrow/escrow-free release rules.
- Local payment gateway integrations planned for emerging markets (JazzCash, EasyPaisa, PayFast) alongside international credit cards (Stripe).

Stripe offers two primary APIs for recurring revenue:

1. **Stripe Billing / Subscriptions**: Automated recurring billing engine managed entirely inside Stripe's infrastructure.
2. **Stripe PaymentIntents / SetupIntents**: Discrete payment authorization and manual capture engine controlled programmatically by our platform backend.

## Decision

Use **Stripe PaymentIntents with Saved Payment Methods (SetupIntents)** triggered and orchestrated by our backend BullMQ scheduler, rather than native Stripe Subscriptions.

## Rationale

1. **Multi-Gateway Portability**: Managing subscription state and billing schedules inside RouteRide's PostgreSQL database allows seamless fallback or parallel integration with local payment gateways (e.g. JazzCash/EasyPaisa) that do not support Stripe Billing objects.
2. **Flexible Proration and Pausing**: School calendars have erratic holiday schedules, term breaks, and mid-cycle pause requests that do not map cleanly to standard calendar-month Stripe Subscription items without constant webhook synchronization overhead.
3. **Atomic State Synchronization**: Subscription status (`ACTIVE`, `PENDING_PAYMENT`, `CANCELLED`) remains strictly authoritative in RouteRide Postgres, avoiding distributed state split-brain issues between Stripe's webhook ledger and local DB tables.

## Alternatives Considered

### Stripe Subscriptions / Billing Engine

- _Pros_: Built-in dunning retries, invoice PDF rendering, automated webhook dispatch.
- _Cons_: Locks business logic into Stripe; difficult to support regional payment providers without bifurcated architectures; complex handling of driver-specific seat adjustments.
- _Rejected_: Vendor lock-in prevents local market expansion and complicates custom multi-party escrow rules.

## Consequences

- **Positive**: Complete platform-side control over billing schedules, dunning cycles, and payment retry intervals.
- **Positive**: Uniform subscription domain model across Stripe and future regional payment processors.
- **Negative**: RouteRide is responsible for scheduling recurring charges (via BullMQ cron jobs) and managing failed payment dunning transitions.

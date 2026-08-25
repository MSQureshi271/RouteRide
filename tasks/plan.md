# Implementation Plan: RouteRide MVP (Gate D → Phase 1.5)

**Sources:** `RouteRide_PRD.docx` v1.0, `RouteRide_TRD.docx` v1.0
**Governing process:** `.agents/skills/` — 24 skills. Every phase below names the skills that gate it.
**Status:** Draft — pending human approval. `planning-and-task-breakdown` requires sign-off before any implementation starts.
**Task list target:** `tasks/todo.md` (this repo designates no external tracker)
**Date:** 2026-08-23

---

## 1. Overview

RouteRide is a recurring-transport subscription marketplace: parents and commuters subscribe to a
vetted driver for a fixed daily schedule, and the platform guarantees that driver's roster stays
route- and time-conflict-free. The MVP targets **one city, consumer parents plus independent
drivers only**, and validates exactly one loop:

    discover a compatible driver → subscribe → track the ride → charge the parent, pay the driver

Everything else in the PRD — institutions, fleet operators, substitute drivers, SOS, AI routing,
multi-city, corporate B2B — is out of MVP scope and appears here only as an *architectural
non-preclusion check*, never as an implementation task.

The engineering centre of gravity is not the app. It is the **deterministic matching and
conflict-prevention engine**, and two failures that must never happen: a driver double-booked into
an impossible schedule, and a child's live location readable by the wrong person. This plan
front-loads both, per the risk-first slicing strategy in `incremental-implementation`.

## 2. Assumptions

The TRD leaves ten technical questions open, four marked "Pre-Phase 0". This plan is written
against the defaults below so that no work is blocked, and every one of them is a Gate D task that
must be confirmed or corrected before Phase 0 exits. Per `using-agent-skills` §1, these are stated
rather than silently absorbed.

**Decided 2026-08-23** (no longer assumptions — see §10 for the discrepancies they close):

- **T-01 / Q3 — Two mobile bundles from one monorepo.** `apps/mobile-consumer` + `apps/mobile-driver`, sharing `packages/ui`.
- **B1 — `ROUND_TRIP` direction is evaluated per leg.** One stored polyline, two evaluations: outbound requires `pos_pickup < pos_dest`, the return leg requires the reverse. No schema change, `ROUND_TRIP` stays in MVP.
- **B2 — SOS is out of MVP**, per PRD §15.2. Emergency-contact details are shared in-app only. `POST /trips/sos` and the `trip:sos` event are removed from the MVP contract surface, and the reputational exposure PRD §18 names is accepted explicitly rather than mitigated in v1.
- **B3 — Payouts settle on payments collected**, per TRD §10.4. No trip-level escrow. Driver no-shows are handled through the refund flow and the 3-strike suspension policy.

| # | Question | Assumed default | Rationale |
|---|---|---|---|
| T-01 | One app binary vs two | **Two bundles from one Expo monorepo** — `apps/mobile-consumer`, `apps/mobile-driver`, shared `packages/ui` | The driver app needs background location and an Android foreground service. Shipping that permission set to parents invites store-review friction and battery complaints, and the two role shells share almost no screens. |
| T-02 | RDS vs Supabase | **RDS PostgreSQL 16 + PostGIS 3.4** | TRD §11.1 already specifies RDS with Terraform; Supabase would strand the IaC and the VPC-only admin API. |
| T-03 | Python matching service vs Node/turf.js | **Python 3.12 + FastAPI** | OR-Tools and Shapely have no Node equivalent; TRD §2.3 already chose it and set a 90% coverage bar on it. |
| T-04 | Socket.IO+Redis vs API Gateway WS | **Socket.IO 4 + Redis adapter** | TRD §6.4's fan-out design and the mobile `socket.io-client` version pin both assume it. |
| Q4 | Local payment gateway | **Stripe only in MVP.** `PaymentGatewayAdapter` interface exists; JazzCash/Easypaisa deferred to Phase 2. | PRD §15.1 scopes MVP billing to card via Stripe. |
| Q5 | Driver pricing freedom | **Platform-enforced min/max range**, driver sets within it | Required to make `monthly_price_cents` validatable at the boundary. |
| Q6 | Subscription commitment | **1-month minimum, cancel with 7-day notice** | PRD F-05 already states the 7-day notice. |
| Q7 | Background checks | **Manual admin document review** | PRD §15.2 defers the API integration. |
| Q11 | School holidays | **Not handled in MVP** (pause is Phase 2, F-17) | PRD §15.2. |

---

## 3. Capability Map

The MVP bundles many independently testable capabilities, which triggers Phase 0 of
`spec-driven-development`: a capability map must be approved **before** any module spec is written.
Module ids are kebab-case, chosen once, and never renamed. Downstream specs are named by id
(`SPEC-identity.md`, `SPEC-route-matching.md`, …).

| Module id | Responsibility | Depends on |
|---|---|---|
| `platform-foundation` | Monorepo, CI/CD, IaC, DB schema + migrations, shared contracts, logging/metrics/tracing baseline, config and secrets | — |
| `identity` | Registration, phone OTP, password auth, Google OAuth, JWT + refresh rotation, RBAC | `platform-foundation` |
| `mobile-shell` | Expo app shells per role, navigation, secure token storage, offline cache, design system | `identity` |
| `notifications` | BullMQ worker, FCM push, SendGrid email, Twilio SMS fallback, in-app notification centre, dedupe and retry | `identity` |
| `driver-onboarding` | Driver profile, vehicle, document upload to S3, route polyline, availability, pricing, verification status | `identity` |
| `consumer-riders` | Consumer profile, emergency contact, rider CRUD, address geocoding | `identity` |
| `route-matching` | Eligibility filters, direction check, capacity, timing conflict, scoring, search API, TSP re-optimisation | `driver-onboarding`, `consumer-riders` |
| `subscriptions` | Request → accept/decline lifecycle, atomic conflict lock, schedule slots, cancellation | `route-matching` |
| `trips` | Daily trip generation, status state machine, driver run list, pickup/dropoff marking | `subscriptions`, `notifications` |
| `realtime-tracking` | WebSocket hub, driver location emission, Redis fan-out, consumer live map, location logs and 30-day purge | `trips` |
| `payments` | Payment methods, monthly charge, webhooks, idempotency, Connect onboarding, payouts, commission, receipts | `subscriptions` |
| `messaging` | One-to-one consumer↔driver chat, quick replies, 90-day retention | `subscriptions` |
| `reviews` | Post-month ratings both directions, verified-only, rating aggregate feeding search rank | `subscriptions`, `trips` |
| `admin-panel` | Driver verification queue, suspension, live trips map, metrics, refunds, manual payouts, audit log | `driver-onboarding`, `payments` |

**Build order:**

```
platform-foundation
   └── identity
         ├── mobile-shell ─────────────┐
         ├── notifications ────────────┤
         ├── driver-onboarding ────┐   │
         └── consumer-riders ──────┤   │
                                   ▼   │
                            route-matching
                                   │   │
                            subscriptions
                                   │   │
                       ┌───────────┼───┴────────┬───────────┐
                       ▼           ▼            ▼           ▼
                     trips      payments    messaging    reviews
                       │
                realtime-tracking
                       │
                  admin-panel
```

`identity` → `driver-onboarding` / `consumer-riders` / `mobile-shell` / `notifications` fan out and
can be built in parallel by separate agents or sessions once the contracts package exists. From
`route-matching` onward the chain is strictly sequential because each stage writes state the next
one reads.

---

## 4. Architecture Decisions

Each of these needs a written ADR under `docs/decisions/` per `documentation-and-adrs`. No prior
ADR convention exists in this repo, so the default location and `ADR-NNN-title.md` numbering apply.

| ADR | Decision | Rationale summary |
|---|---|---|
| ADR-001 | Two mobile bundles from one Expo monorepo | Divergent permission sets and near-zero screen overlap between roles (see §2, T-01) |
| ADR-002 | PostgreSQL 16 + PostGIS 3.4 on RDS, Prisma 5 with raw SQL for geography | Prisma has no native geography type; GIST-indexed `ST_DWithin` is the hot path |
| ADR-003 | Route-matching as a separate Python FastAPI service | OR-Tools + Shapely; accepted cost is a polyglot deploy |
| ADR-004 | Socket.IO + Redis pub/sub for realtime, drivers sticky-sessioned | Cross-node fan-out without sticky consumers |
| ADR-005 | pnpm workspaces monorepo with a shared `packages/contracts` Zod package | Contract-first slicing lets mobile and API proceed in parallel |
| ADR-006 | Stripe PaymentIntents (manual charge), not Stripe Subscriptions | Retry logic and future local-gateway fallback need platform-side control (TRD §10.1) |
| ADR-007 | Integer cents for all money, `TIMESTAMPTZ` UTC for all times, `TIME` + explicit city timezone for schedules | Rounding and DST correctness |
| ADR-008 | **Drop Firebase Realtime Database from the MVP stack** | Trip status already travels over Socket.IO, FCM, and Postgres. A fourth path is a third source of truth with no consumer. `using-agent-skills` §4 (Enforce Simplicity). Revisit only if a measured need appears. |
| ADR-009 | `driver_schedule_slots` is a derived conflict-detection cache, rebuilt transactionally on every roster change; `subscriptions` is the source of truth | Prevents divergence between the two |
| ADR-010 | Location retention: 30 days in Postgres, hard purge, no archive in MVP | Children's location is sensitive data; the cheapest data to protect is the data you no longer hold (`security-and-hardening`, Data Privacy) |

## 5. Definition of Done (project-wide)

Seven reference files are cited by the skills but absent from this repo
(`.agents/references/definition-of-done.md`, `security-checklist.md`, `performance-checklist.md`,
`accessibility-checklist.md`, `observability-checklist.md`, `testing-patterns.md`,
`orchestration-patterns.md`). Multiple skills defer their final gate to
`definition-of-done.md` as "the standing bar every task clears", so it must exist before Phase 0
task work begins. Task **T0.02** authors all seven; the DoD content is fixed here:

A task is done only when **all** of the following hold. This is on top of, not instead of, the
task's own acceptance criteria.

- [ ] Every new behaviour has a test written before the implementation (`test-driven-development`)
- [ ] The repository's full test command passes; no test skipped, disabled, or deleted to get green
- [ ] Lint, type check, and build all pass
- [ ] Coverage did not decrease, and meets the module threshold (API 80/75, matching 90/85, mobile 70/65)
- [ ] Behaviour verified at runtime, not just in tests — a real request, a real screen, or a real job run
- [ ] New endpoints validate input at the boundary with a Zod schema and enforce auth + ownership
- [ ] Telemetry exists: structured log with `requestId`, RED metrics for new endpoints and external calls
- [ ] No secrets in the diff or in history; no PII or coordinates finer than 2dp in any log line
- [ ] The change is one logical thing, committed with a conventional-commit message
- [ ] Docs updated where the change touches them: spec, README, ADR, changelog entry, OpenAPI
- [ ] A change summary was produced, including what was deliberately **not** touched

---

## 6. How this plan satisfies `.agents/skills/`

| Skill | Where it lands in this plan |
|---|---|
| `using-agent-skills` | Assumptions surfaced in §2; confusions raised in §10 rather than guessed; simplicity enforced (ADR-008 deletes a store); scope discipline — no Phase 2/3 features are tasked |
| `spec-driven-development` | Capability map (§3) approved before module specs; T0.05 writes one `SPEC-<module>.md` per module id, each covering all six core areas |
| `planning-and-task-breakdown` | This document plus `tasks/todo.md`; every task has acceptance criteria, a verification step, dependencies, files, and a size; no task exceeds M (~5 files); checkpoints every 2–3 tasks or at slice boundaries |
| `incremental-implementation` | Vertical slices (§8); risk-first ordering puts matching, the atomic conflict lock, and realtime before payments and admin; feature flags on every module (T1.72) |
| `test-driven-development` | RED-first is a DoD line item; the test pyramid is budgeted (>200 unit, >80 integration, 12 E2E, 5 load) and each is a named task, not a leftover |
| `api-and-interface-design` | T0.14 defines the whole DTO contract before any endpoint exists; single error envelope (T0.15); pagination on every list endpoint; idempotency claimed atomically via unique constraint (T1.14, T1.42, T1.45) |
| `security-and-hardening` | STRIDE threat model per trust boundary at Gate D (`T-D.09`) and re-run at `T1.63`; abuse-case tests are tasks (`T0.29`, `T1.31`, `T1.45`); privacy register plus a working deletion path (`T-D.08`, `T1.61`) |
| `observability-and-instrumentation` | Instrumented as built, not after: T0.16–T0.18 land the baseline in Phase 0; on-call questions written per module; alerts symptom-based and each test-fired once (T1.70); telemetry itself verified (T1.71) |
| `performance-optimization` | Measure-first: matching perf harness (T1.09) exists before any optimisation; `PERF.md` ledger records reverted attempts (T1.68); neutral changes revert |
| `ci-cd-and-automation` | All gates in CI from day one (T0.08–T0.10); branch protection; rollback workflow (T0.23) exists before the first staging deploy |
| `frontend-ui-engineering` | Design tokens and component library before screens (`T0.32`); loading, empty, and error states are acceptance criteria on every screen task; WCAG 2.1 AA pass (`T1.69`); explicit no-AI-aesthetic constraint |
| `git-workflow-and-versioning` | T0.01 initialises the repo — it is not one today; trunk-based with 1–3 day branches; conventional commits; changelog entry written with the change, not at release |
| `code-review-and-quality` | Five-axis review before every merge; ~100-line target, 1000-line hard split; findings labelled Critical/Required/Nit |
| `documentation-and-adrs` | Ten ADRs named in §4; README, OpenAPI, and changelog are DoD items |
| `doubt-driven-development` | Mandatory on the eight artefacts listed in §9 — every one asserts a property the compiler cannot check |
| `source-driven-development` | Mandatory before writing against Stripe, Prisma+PostGIS, OR-Tools, Expo/RN, `react-native-maps`, Socket.IO, and firebase-admin; version pins come from the dependency file, patterns from the official docs, with cited URLs |
| `debugging-and-error-recovery` | Every bug found in beta gets a failing reproduction test before a fix (Prove-It) |
| `code-simplification` | Explicit pass at each phase checkpoint; ADR-008 is its first output |
| `context-engineering` | T0.03 authors `CLAUDE.md` and a project map so later sessions load the right slice, not the whole spec |
| `shipping-and-launch` | The full six-section pre-launch checklist is task T1.79; staged rollout with documented thresholds is T1.80; first-hour verification is T1.81 |
| `deprecation-and-migration` | Not exercised in MVP (nothing to retire). Applies to the Phase-2 `driver_schedule_slots` and pricing changes; noted so it is not forgotten |
| `browser-testing-with-devtools` | Applies to the Next.js admin panel only (T1.58–T1.59); mobile uses Detox |
| `interview-me` / `idea-refine` | Already served by the PRD/TRD. Re-open only if Gate D answers contradict the PRD's stated goals |

---

## 7. Phase structure and schedule

The PRD's roadmap is kept as the phase skeleton so the two documents stay comparable, but the
week budget does not survive contact with the task list. Reporting that honestly is part of the
deliverable.

| Phase | PRD budget | Task count | Realistic budget | Exit condition |
|---|---|---|---|---|
| **Gate D** — decisions and guardrails | *not in PRD* | 9 | 1 week | Every Pre-Phase-0 question answered in an ADR; scope discrepancies resolved; legal posture confirmed |
| **Phase 0** — foundation | Weeks 1–4 | 44 | **6–7 weeks** | Both roles can register, onboard, and reach their app shell. CI enforces every gate. No booking yet. |
| **Phase 1A** — discovery and matching | Weeks 5–7 | 13 | 3–4 weeks | Search returns deterministic, ranked, eligible drivers inside the P99 budget |
| **Phase 1B** — subscription lifecycle | Week 8 | 11 | 2 weeks | 50 concurrent accepts on the last seat produce exactly one ACTIVE subscription |
| **Phase 1C** — trips and live tracking | Weeks 9–10 | 15 | 3–4 weeks | A parent sees the live location and receives all four trip notifications |
| **Phase 1D** — payments and payouts | Week 11 | 12 | 3 weeks | Charge, webhook replay, dunning, and a 500-driver payout batch all correct |
| **Phase 1E** — messaging, reviews, admin | Week 12 | 9 | 2–3 weeks | An admin can verify a driver, watch live trips, and issue a refund |
| **Phase 1.5** — hardening and beta | Weeks 13–16 | 21 | 6–8 weeks | Go/no-go recorded against the full pre-launch checklist; staged rollout completed |

**Total: ~26–32 weeks of engineering, against the PRD's 16.** The gap is not padding. It is the
cost of the things the PRD roadmap does not have a week for and that the skills make mandatory:
writing tests before code, a threat model and a pen test, WCAG 2.1 AA, the five load-test scenarios
the TRD itself demands, working GDPR export and deletion, and the observability baseline that makes
launch-day monitoring possible. Cutting the calendar means cutting scope, and that is the user's
call, not the plan's. §12 lists the safe cuts if 16 weeks is fixed.

### Why the phases are sliced this way

Horizontal slicing — all schema, then all API, then all UI — is the failure mode
`planning-and-task-breakdown` warns about. Instead:

- **Phase 0 is deliberately horizontal**, and that is the one legitimate exception: foundation,
  contracts, and CI have no user-visible slice, and building a feature on absent CI means retrofitting
  gates later. It ends with one genuinely vertical slice (register → onboard → app shell) to prove the
  foundation carries weight.
- **Phases 1A–1E are vertical.** Each ends with something a human can do end-to-end, and each
  contains its own schema deltas, service logic, endpoints, screens, tests, and telemetry.
- **Risk-first inside each slice.** The three highest-uncertainty artefacts in the whole MVP —
  PostGIS eligibility filtering, the SERIALIZABLE conflict lock, and WebSocket fan-out — are the
  *first* task of their phase, not the last. If PostGIS cannot hit the P99 budget on 500 drivers, that
  needs to surface in week 8, not week 15.
- **Contract-first at every parallel boundary.** `packages/contracts` (T0.14) is what lets mobile
  work against typed mocks while the API is still being written.

---

## 8. Task list

The 134 tasks live in **`tasks/todo.md`**, grouped by phase, each with description, acceptance
criteria, verification, dependencies, files, size, and governing skills. Index:

| Group | Tasks | Checkpoint |
|---|---|---|
| Gate D — decisions and guardrails | `T-D.01` – `T-D.09` | Checkpoint D |
| Phase 0 — repo, CI, contracts, observability | `T0.01` – `T0.24` | Checkpoints 0-A, 0-B, 0-C |
| Phase 0 — identity, shells, onboarding | `T0.25` – `T0.44` | Checkpoint 0-D |
| Phase 1A — route matching and discovery | `T1.01` – `T1.13` | Checkpoint 1-A |
| Phase 1B — subscription lifecycle | `T1.14` – `T1.24` | Checkpoint 1-B |
| Phase 1C — trips and realtime tracking | `T1.25` – `T1.39` | Checkpoint 1-C |
| Phase 1D — payments and payouts | `T1.40` – `T1.51` | Checkpoint 1-D |
| Phase 1E — messaging, reviews, admin | `T1.52` – `T1.60` | Checkpoint 1-E (MVP feature complete) |
| Phase 1.5 — hardening, beta, launch | `T1.61` – `T1.81` | Checkpoint 1.5 (public launch) |

## 9. Mandatory doubt-driven artefacts

`doubt-driven-development` applies to decisions asserting a property the type system cannot verify.
Eight artefacts in this MVP qualify, and each gets a fresh-context adversarial review — ARTIFACT +
CONTRACT only, never the claim — before it is committed:

1. **The eligibility filter set** (`T1.02`–`T1.05`) — asserts "no ineligible driver is ever surfaced"
2. **The atomic conflict lock** (`T1.16`) — asserts "no double-booking under concurrency"
3. **The TSP window constraint** (`T1.19`) — asserts "no committed pickup window is violated"
4. **Location authorisation** (`T1.31`) — asserts "only the assigned driver's channel is readable"
5. **Payment idempotency derivation** (`T1.42`) — asserts "no parent is charged twice"
6. **Payout arithmetic** (`T1.47`) — asserts "commission is exact to ±0.1%"
7. **The trip state machine** (`T1.27`) — asserts "no illegal transition is reachable"
8. **The deletion path** (`T1.61`) — asserts "a purge leaves no personal data behind"

Cross-model review must be *offered* on each of these in an interactive session, and the answer
recorded. Silently skipping the offer is the red flag, not skipping the review.

---

## 10. Discrepancies found between PRD and TRD

`using-agent-skills` §2 requires naming inconsistencies rather than picking an interpretation.
Eleven were found while reading the two documents. Each is a Gate D or Phase 0 task; none should be
resolved by an implementer guessing.

**Scope conflicts**

1. **~~SOS is both in and out of scope.~~ RESOLVED — out of MVP.** PRD §15.2 puts SOS out of scope,
   but TRD §5.7 specifies `POST /trips/sos` with no `[PHASE 2]` marker and §6.2 specifies a
   `trip:sos` WebSocket event, while PRD §18 lists "SOS system live at public launch" as the
   mitigation for the highest-impact reputational risk. **Decision: follow PRD §15.2.** The endpoint
   and the event come out of the MVP contract surface; emergency-contact details are shared in-app
   only. The consequence is that RouteRide launches child transport without a panic button, so the
   PRD §18 risk row must be re-rated as *accepted, unmitigated in v1* rather than silently left
   pointing at a feature that does not exist. Flag it for the Phase 2 plan.
2. **Apple sign-in.** PRD F-01 lists Google *and* Apple; §15.1 lists Google only, and the TRD has
   only Google. Apple's App Store guideline 4.8 requires offering Sign in with Apple when a
   third-party social login is offered on iOS — so "Google only" is a submission risk, not a saving.
   Still open; resolved at `T1.78`.
3. **~~Escrow payout.~~ RESOLVED — pay on payments collected.** PRD §18 mitigated driver abandonment
   with "driver paid only after trips confirmed", but TRD §10.4's payout query sums *successful
   payments in the period*. **Decision: TRD §10.4 stands.** Abandonment is handled through the refund
   flow and the 3-strike suspension policy instead, which means those two controls are now
   load-bearing and must actually exist — the refund path is `T1.57` and the strike counters are
   `T1.28`. Update the PRD §18 row so it stops citing escrow.
4. **~~`ROUND_TRIP` direction.~~ RESOLVED — evaluate per leg.** `ROUND_TRIP` is in MVP scope (PRD
   F-05, §15.1), but the engine stores one `route_polyline` per driver and rejects a candidate when
   `pos_pickup >= pos_dest` (TRD §4.1 Step 2), so under the literal algorithm **no round-trip search
   can ever return a driver**. **Decision: check direction per leg** — outbound against the polyline
   as stored, return against the reverse traversal. No schema change. `T1.03` implements it and must
   carry a test that fails against the literal TRD algorithm.
5. **Conflict-check strictness.** PRD §7.3 says windows must not overlap "such that both could not
   be served"; TRD §4.1/§4.3 implement a plain interval overlap. The TRD version is strictly harsher
   and will suppress matches the PRD would allow. **Resolved (B4) — 2026-08-23**: plain interval overlap (TRD §4.1) is the implementation. The PRD §7.3 wording is treated as explanatory intent only. The match-success KPI is revised to ≥80% (from ≥85%) to reflect the stricter check. See `docs/SPEC-DELTA-mvp.md` §B4 for full rationale.

**Schema gaps — tables and columns the TRD's own text requires but its DDL omits**

6. `refresh_tokens(token_hash, user_id, expires_at, revoked_at)` — described in §8.1, absent from §3.1.
7. `payment_methods` — endpoints exist in §5.8 and §10.2 reads `payment_method.gateway`, but there is no table.
8. `support_tickets` — in the PRD data model, and §6.2 says an SOS "create[s] a SupportTicket"; absent from the DDL.
9. `driver_profiles.acceptance_rate` and a "typical time" column — both read by the scoring code in
   §4.1 Step 5 ("pre-computed daily"), neither exists.
10. `trips.location_log_id` is a bare `UUID` with no foreign key to `location_logs`.

**A defect in the specified SQL**

11. The Step 1 candidate query in TRD §4.1 joins `reviews` and `subscriptions` in the same
    `GROUP BY`, producing a cartesian product across the two. `AVG(r.rating)` and
    `COUNT(DISTINCT s.id)` are therefore both wrong whenever a driver has more than one review *and*
    more than one subscription — `AVG` is fan-out-weighted rather than a true average. The
    aggregates must be computed in separate subqueries or lateral joins. Ranking correctness depends
    on this, so it is fixed in `T1.02` with a test that fails against the original query.

---

## 11. Risks and mitigations

Carrying forward the PRD §18 risks that have an *engineering* mitigation in this plan, plus the ones
that only surfaced from reading the TRD.

| Risk | Impact | Mitigation in this plan |
|---|---|---|
| `ROUND_TRIP` cannot match under the literal TRD direction check (§10.4) | **High** — a headline MVP feature returns zero results | **Resolved**: per-leg direction evaluation. `T1.03` implements it with a test that fails against the literal TRD algorithm |
| Ranking is wrong because of the fan-out aggregate bug (§10.11) | High — silently mis-ranks every search | `T1.02` splits the aggregates; regression test fails against the original query |
| Race-condition double-booking | High — destroys the core product promise | `T1.16` SERIALIZABLE + `FOR UPDATE` + one retry on 40001; `T1.17` proves it with 50 concurrent accepts |
| Children's location data exposure | **Catastrophic** | Channel-level authorisation test (`T1.31`), 30-day purge job (`T1.32`), coordinate rounding in logs (`T0.16`), pen test before launch (`T1.66`), no third-party trackers |
| Duplicate charges on webhook or job retry | High — direct financial and trust damage | Idempotency key derived from `(subscriptionId, billingDate)`, claimed via unique constraint; intent recorded before the Stripe call; `T1.45` covers replay, payload mismatch, and in-flight duplicate |
| Matching cannot meet P99 400 ms at 500 drivers | Medium — degrades the whole discovery flow | `T1.09` measures it in Phase 1A, before any dependent UI exists; the fallback is a coarse bbox pre-filter plus a smaller result cap |
| PostGIS + Prisma friction (no native geography type) | Medium — schema drift between Prisma and raw DDL | ADR-002; raw DDL confined to one migration file; `T0.11` asserts the geography columns and GIST indexes exist via a test that queries `pg_indexes` |
| Location tracking drains driver batteries; drivers disable the app | Medium — silently breaks tracking | Adaptive emission (5 s active / 60 s idle), `distanceFilter: 20`, foreground service, and a driver-facing staleness alert (`T1.70`) |
| Timezone and DST errors in a `TIME`-based schedule | Medium — pickups drift by an hour twice a year | ADR-007; `T1.07` includes explicit DST-transition cases |
| Launching child transport with no panic button (B2 decided SOS out) | **High** — reputational, and PRD §18's stated mitigation no longer exists | Accepted explicitly, not silently. The refund path (`T1.57`) and 3-strike suspension counters (`T1.28`) become load-bearing; the safety-incident protocol (`T1.74`) and the 24/7 support contact must be operationally real at launch even without an in-app SOS button; SOS is first in the Phase 2 queue |
| Driver abandonment mid-subscription (B3 removed escrow) | Medium | Refund flow for missed trips, 3-strike suspension, and the driver-absence notification fan-out (`T1.28`). Substitute drivers remain Phase 2 |
| Two mobile bundles double the release surface (B5) | Low | Shared `packages/ui` and `packages/contracts`; one CI pipeline with path filters; the Detox suite runs both apps in the same nightly job |
| Driver supply cold start | High — business, not engineering | Ops mitigation from the PRD (pre-launch recruitment, 0% commission). Engineering support: the search endpoint returns a structured no-match with radius metadata so ops can widen it without a deploy |
| 16-week PRD budget vs ~28-week task list | High — schedule pressure becomes silent quality cuts | Surfaced now, in §7, with the safe cuts named in §12 rather than discovered in week 14 |
| Datadog + Sentry + PagerDuty + Firebase at pre-revenue scale | Low — cost, not correctness | ADR-008 already drops Firebase RTDB. Revisit Datadog vs an OTel-native backend at Gate D; the instrumentation is vendor-neutral OTel either way, so the choice stays reversible |

## 12. Open questions requiring human input

**Resolved:**
- **B1** (per-leg direction), **B2** (SOS out of MVP), **B3** (payouts on payments collected), **B4** (plain interval overlap; match-success KPI revised to ≥80%), **B5** (two mobile bundles).
- **B6** (Launch market: Karachi, Pakistan; PKR currency; Asia/Karachi timezone; BBox 24.70–25.15 / 66.85–67.35).
- **B7** (Operator posture: Pure Technology Marketplace; manual admin document review of CNIC, license, vehicle registration).
- **Q5 / Commission** (0% launch commission backed dynamically by DB `platform_config` table; driver price bounds PKR 5,000–30,000).
- **Q9** (Female-driver filter deferred to Phase 2; schema kept minimal for MVP).

All Gate D blocker decisions are **resolved and locked**.

**Non-blocking, needed before the phase named:**

- Driver price range bounds and platform commission per tier (Q5, before `T0.40`)
- Whether scoring weights are admin-configurable or constants (T-10, before `T1.06`)
- Minimum verified-driver count before consumer signups open in a city (Q2, before `T1.76`)
- Google Maps API cost model at 500 DAU (T-06, before `T1.79`)
- OTA update policy and its store-review implications (T-05, before `T1.78`)

**If the 16-week calendar is fixed, these are the safe cuts** — in the order I would take them, and
none of them touches a safety or money invariant: in-app messaging (`T1.52`–`T1.53`, use phone
numbers instead), driver→consumer ratings (keep consumer→driver only), the admin live-trips map
(keep the verification queue), the receipt PDF pipeline (email a plain-text receipt), and Google
OAuth (phone + password only). Not cuttable: the conflict lock, location authorisation, the purge
job, payment idempotency, WCAG AA, and the pen test.

---

## 13. Parallelisation

| Safe to parallelise | Must be sequential | Needs coordination |
|---|---|---|
| `mobile-shell`, `notifications`, `driver-onboarding`, `consumer-riders` after `identity` lands | Every database migration | Any task pair spanning API and mobile — settle the contract in `packages/contracts` first, then split |
| Admin panel (`T1.56`–`T1.60`) against the finished API, in parallel with Phase 1.5 hardening | `route-matching` → `subscriptions` → `trips` → `realtime-tracking` | Notification templates: the copy and the FCM payload type registry must be agreed before senders and handlers are split |
| Test-writing for already-implemented modules | Anything writing `driver_schedule_slots` | Terraform and CD, which share the ECR and Secrets Manager namespaces |
| The seven reference docs (`T0.02`) and the module specs (`T0.05`) | Payment webhook handling vs the payout scheduler (shared money state) | — |

If agents work in parallel, use one git worktree per feature branch so a failed experiment is a
directory deletion rather than a reset.

## 14. Explicitly out of scope for this plan

No task in `tasks/todo.md` implements any of the following. They are PRD Phase 2 or 3, and the only
obligation the MVP carries is not to *architecturally preclude* them (TRD §1). Where a Phase 0/1
decision protects one, it is noted:

- Institutional accounts and bulk student import (F-13) — protected by `INSTITUTION_ADMIN` existing in `user_role` from migration v1
- Fleet operator dashboard (F-14) — protected by `FLEET_ADMIN` in `user_role`
- Advanced route re-optimisation and savings estimates (F-15) — the TSP module boundary is already separate
- Substitute driver system (F-16) — protected by `driver_payouts` being period-based rather than subscription-based
- Subscription pause and pro-rated billing (F-17) — protected by `sub_status` already containing `PAUSED`
- Trip replay and 12-month history (F-18) — protected by `location_logs` existing, though ADR-010's 30-day purge means replay only ever covers 30 days until a retention change is agreed
- Route-deviation alerts (F-19) — protected by `trips.deviation_alert_sent` existing
- Multi-language and RTL (F-20) — protected by `i18next` scaffolded in `T0.31` and `users.preferred_language` in v1
- Earnings intelligence (F-21), referrals (F-22), AI routing (F-23), dynamic pricing (F-24),
  multi-city (F-25), background-check APIs (F-26), wearables (F-27), corporate B2B (F-28),
  insurance (F-29), passenger self-service app (F-30)

Basic SOS is **decided out of MVP** (B2, §10.1). `POST /trips/sos` and the `trip:sos` WebSocket
event are removed from the MVP contract surface, no SOS task appears in `tasks/todo.md`, and PRD §18's
risk row must be updated to stop citing a feature that will not exist at launch. SOS is first in the
Phase 2 queue; until then the safety-incident protocol in `T1.74` and a real 24/7 support contact are
the only controls, and `T1.79`'s go/no-go must acknowledge that explicitly rather than tick past it.

---

## Verification of this plan

Per `planning-and-task-breakdown`:

- [x] Every task has acceptance criteria
- [x] Every task has a verification step
- [x] Task dependencies are identified and ordered correctly
- [x] Tasks are recorded in the task list target (`tasks/todo.md`)
- [x] No task touches more than ~5 files
- [x] Checkpoints exist between major phases
- [x] B1, B2, B3, B5 answered and folded back into the plan
- [ ] **The human has reviewed and approved the plan** ← outstanding
- [ ] **Gate D questions B4, B6, B7 answered** ← outstanding









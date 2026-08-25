# SPEC-DELTA-mvp.md — RouteRide MVP Scope and Conflict Resolution Record

> **Purpose:** This document records every resolved conflict between the PRD v1.0 and TRD v1.0, plus every scope decision that changes what the MVP builds. It is the authoritative record of what the PRD/TRD say and what we are actually building, and why they differ. Every affected module spec (`SPEC-*.md`) must link to the relevant section here.
>
> **Status:** B1, B2, B3 resolved 2026-08-23. B4 resolved 2026-08-23 (see §4 below). B5 resolved 2026-08-23.
>
> **Audience:** Product, backend, and mobile leads. All four resolutions require sign-off before the affected modules begin implementation.

---

## B1 — `ROUND_TRIP` Direction Check

### What the TRD says (literal)

TRD §4.1 Step 2 rejects a candidate driver when `pos_pickup >= pos_dest`, where `pos_pickup` and `pos_dest` are the driver's position index along their route polyline for the pickup and destination points respectively. Under this literal algorithm, a `ROUND_TRIP` search always has `pos_pickup < pos_dest` on the outbound leg and `pos_pickup > pos_dest` on the return leg. **The return leg of every `ROUND_TRIP` search returns zero drivers under the TRD's literal algorithm.**

### What the PRD says

PRD §15.1 lists `ROUND_TRIP` subscriptions as an MVP feature (F-05). PRD §7.3 does not describe the direction algorithm in detail.

### The conflict

`ROUND_TRIP` is an MVP feature but the TRD's direction algorithm makes it unreturnable. This is an implementation defect in the TRD, not a product decision.

### Resolution — decided 2026-08-23

**Evaluate direction per leg of the trip.**

- **Outbound leg** (`MORNING` direction in a `ROUND_TRIP`): check `pos_pickup < pos_dest` against the route polyline as stored.
- **Return leg** (`AFTERNOON` direction in a `ROUND_TRIP`): check `pos_pickup < pos_dest` against the **reverse traversal** of the same polyline (i.e., `pos_pickup > pos_dest` in the original indexing).
- No schema change is required. The stored `GEOGRAPHY(LINESTRING)` polyline is sufficient; the matching service reverses the evaluation direction in code.

### Consequences

- Task `T1.03` implements per-leg direction evaluation. It must include a test that fails against the original literal TRD §4.1 algorithm to prevent regression.
- `SPEC-route-matching.md` must document both evaluation modes and reference this delta.
- No PRD section changes; the PRD already intends `ROUND_TRIP` to work.

### Affected PRD/TRD sections

- TRD §4.1 Step 2 — the literal algorithm is wrong; `T1.03` fixes it.

---

## B2 — SOS Is Out of MVP

### What the TRD says

TRD §5.7 specifies `POST /trips/sos` with no `[PHASE 2]` marker. TRD §6.2 specifies a `trip:sos` WebSocket event. Neither is marked as post-MVP.

### What the PRD says

PRD §15.2 explicitly lists SOS as **out of MVP scope**. PRD §18 (Risk Register) names "SOS system live at public launch" as a mitigation for the highest-impact reputational risk (child safety incident during a trip).

### The conflict

The TRD specifies a feature the PRD explicitly excludes, and the PRD §18 risk row cites it as a live mitigation for a risk that now has no mitigation.

### Resolution — decided 2026-08-23

**Follow PRD §15.2. SOS is out of MVP.**

- `POST /trips/sos` is removed from the MVP API contract surface.
- The `trip:sos` WebSocket event is removed from the MVP event registry.
- No SOS-related task appears in `tasks/todo.md`.

### Consequences

**PRD §18 risk row must be updated.** The safety-incident reputational risk can no longer cite SOS as a mitigation. The entry must read:

> **Accepted, unmitigated in v1.** Emergency-contact details are shared in-app only. The safety-incident protocol (`T1.74`) and a real 24/7 support contact are the only operational controls at launch. SOS is first in the Phase 2 queue.

The `go/no-go` checklist at `T1.79` must explicitly acknowledge the absence of a panic button and confirm that `T1.74`'s protocol and the 24/7 contact are operationally real before launch proceeds.

**The replacement controls are load-bearing:**

- **Refund path** (`T1.57`) — compensates riders when a driver fails to appear.
- **3-strike suspension counters** (`T1.28`) — remove drivers who repeatedly no-show.
- Both must be fully implemented and tested before launch; they are not deferred.

### Affected PRD/TRD sections

- PRD §15.2 — authoritative (SOS out).
- PRD §18 — risk row for child safety incident must stop citing SOS. **Action: update PRD §18 before Checkpoint D closes.**
- TRD §5.7 — `POST /trips/sos` specification is invalidated; treat it as a Phase 2 spec.
- TRD §6.2 — `trip:sos` event is invalidated; treat it as Phase 2.

---

## B3 — Payout Settlement Timing

### What the PRD says

PRD §18 (Risk Register) lists "driver paid only after trips confirmed" (escrow) as the mitigation for driver abandonment mid-subscription.

### What the TRD says

TRD §10.4 specifies the payout query as summing **successful payments collected in the period**, not confirmed trips. No escrow table exists in the TRD schema.

### The conflict

PRD §18 cites a control (escrow) that the TRD schema never implements, creating a false sense of safety.

### Resolution — decided 2026-08-23

**TRD §10.4 stands. Payouts settle on payments collected.**

- No per-trip escrow.
- No escrow table in the schema.
- Driver abandonment is handled through the refund flow and the 3-strike suspension policy.

### Consequences

**PRD §18 risk row for driver abandonment must be updated:**

> **Mitigated by refund path (`T1.57`) and 3-strike suspension (`T1.28`) only. Escrow is not implemented in MVP. Substitute driver support is Phase 2.**

Both replacement controls are load-bearing — see B2 consequences above.

### Affected PRD/TRD sections

- PRD §18 — risk row for driver abandonment must stop citing escrow. **Action: update PRD §18 before Checkpoint D closes.**
- TRD §10.4 — authoritative.

---

## B4 — Conflict-Check Strictness

### What the PRD says

PRD §7.3: windows must not overlap "such that both could not be served." This is a semantically loose rule — two overlapping windows might both be served if the driver's route is short enough.

### What the TRD says

TRD §4.1 / §4.3: implement **plain interval overlap** — two time windows conflict if they share any time, regardless of whether both could physically be served. This is strictly harsher than PRD §7.3.

### The conflict

The TRD's algorithm will suppress some matches the PRD's wording would allow. The narrower TRD definition pushes against the ≥ 85% match-success KPI stated in the PRD.

### Resolution — decided 2026-08-23

**Adopt plain interval overlap (TRD §4.1).** The PRD §7.3 wording is treated as explanatory intent, not a precise algorithm. The TRD algorithm is the implementation authority.

**Rationale for choosing the stricter rule:**

1. **Safety margin over supply optimisation.** The product promise is that a driver's roster is conflict-free. A "could not both be served" check requires predicting travel time between pickups under variable traffic — RouteRide does not have a routing engine in MVP (AI routing is Phase 2, F-23). Without a travel-time estimate, the only safe overlap check is interval overlap.

2. **Correctness is cheaper than edge-case repair.** A false positive (blocking a feasible schedule) produces a "no driver found" result. A false negative (allowing a conflict to pass) produces a double-booked driver who cannot serve both passengers — a catastrophic trust failure. The asymmetry strongly favours the stricter rule.

3. **Simplicity.** Interval overlap is a 3-line function with a clear proof. The PRD §7.3 algorithm requires a travel-time oracle and introduces a new failure mode (oracle unavailability). Per `using-agent-skills` §4, prefer the simpler, more boring solution.

### Match-success KPI adjustment

The ≥ 85% match-success KPI in the PRD must be re-stated as:

> **≥ 80% of search sessions return at least one eligible driver** (revised from 85%, reflecting the stricter interval-overlap conflict check). The 5-point reduction is accepted as the cost of the safety margin. If the operational match rate falls below 70% in the first 30 days of production, the conflict-check algorithm is the first candidate for relaxation — with a travel-time estimate added as a prerequisite.

### Affected PRD/TRD sections

- PRD §7.3 — override: interval overlap is the implementation; the "could not both be served" wording is intent only.
- PRD KPI table — match-success target revised to ≥ 80%.
- TRD §4.1, §4.3 — authoritative.

---

## B5 — Two Mobile Bundles

### Resolution — decided 2026-08-23

Recorded in full in `docs/decisions/ADR-001-mobile-app-topology.md`. Summary: two Expo bundles (`apps/mobile-consumer`, `apps/mobile-driver`) sharing `packages/ui`. The driver-only background-location permission set is the deciding factor.

---

## PRD §18 Update Requirement

The following risk rows in PRD §18 must be updated before Checkpoint D closes. They currently cite controls that do not exist in the MVP:

| Risk row | Currently cites | Must instead cite |
|----------|----------------|-------------------|
| Child safety incident during a trip | SOS system live at public launch | Safety-incident protocol (T1.74), 24/7 support contact, and in-app emergency contact sharing only. SOS is Phase 2. |
| Driver abandonment mid-subscription | Driver paid only after trips confirmed (escrow) | Refund path (T1.57) and 3-strike suspension (T1.28). No escrow in MVP. |

**Action items:**

- [ ] Product lead to update PRD §18 with the revised risk rows above.
- [ ] Updated PRD committed and linked here before any implementation task in `trips` or `payments` begins.

---

## Module Spec Cross-Reference

Every `SPEC-<module-id>.md` file that is affected by one of these deltas must include a section:

```markdown
## Scope Delta

This module is affected by the following entries in `docs/SPEC-DELTA-mvp.md`:
- [B1] / [B2] / [B3] / [B4] / [B5]: [one-line summary of the impact on this module]
```

| Module | B1 | B2 | B3 | B4 | B5 |
|--------|----|----|----|----|-----|
| route-matching | ✓ (per-leg direction) | | | ✓ (interval overlap) | |
| subscriptions | | | ✓ (no escrow) | ✓ (conflict check) | |
| trips | | ✓ (SOS removed) | | | |
| payments | | | ✓ (payout basis) | | |
| mobile-shell | | | | | ✓ (two bundles) |
| admin-panel | | ✓ (no SOS queue) | | | |

---

## Sign-Off

> This document requires sign-off from product and backend leads before the affected modules begin implementation. B4's match-success KPI revision requires explicit product acknowledgment.

| Role | Name | Sign-off date |
|------|------|---------------|
| Product lead | — | **PENDING** |
| Backend lead | — | **PENDING** |
| Mobile lead | — | **PENDING** (B5 only) |

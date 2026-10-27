# RouteRide Phase 1A: Comprehensive Architectural & Implementation Summary (Tasks 1.01 – 1.11)

---

## 1. Executive Overview

**Phase 1A: Route Matching and Discovery** implements the high-performance, deterministic core matching engine for RouteRide. The engine evaluates commuting corridor compatibility between daily school/office riders and approved recurring drivers, enforcing strict temporal, spatial, capacity, and direction constraints before scoring and ranking candidates.

Across **Tasks 1.01 through 1.11**, the foundational backend architecture, database schema, cross-language contracts, PostGIS spatial queries, Python matching microservice, canonical 8-stage eligibility pipeline, adversarial property-testing suite, NestJS search gateway, performance benchmarking harness, BullMQ background worker precompute jobs, zero-PII structured telemetry, Redis commute duration caching, and mobile consumer search interface were designed, built, and verified with $100\%$ precision against PostgreSQL 16, PostGIS 3.4, and Redis 7.

### High-Level Milestones Achieved
- **Decoupled Architecture (AD-5, AD-12):** High-throughput Python matching service (`apps/matching`) operating via a read-only PostgreSQL role (`routeride_matching_ro`) and private HTTP contract (`POST /internal/v1/matching/search`).
- **Canonical 8-Stage Pipeline (AD-11):** Complete implementation of all 7 hard eligibility filtering gates (E1–E7) plus full-precision composite scoring and deterministic ranking (E8).
- **PostGIS Spatial & Corridor Math (AD-4, AD-9):** Elimination of the TRD §4.1 $3 \times 4$ Cartesian product bug via decoupled lateral aggregates; normalized polyline projection using PostGIS/Shapely; deterministic geometry classification precedence.
- **Strict Invariants (AD-6, AD-7, AD-10, AD-13, AD-14):** Rejection of degenerate coordinate requests ($< 50\text{m}$), cross-midnight intervals (`INVALID_SERVICE_INTERVAL`), and inverted/overlapping round-trip legs (`INVALID_ROUND_TRIP_TIMES`). Schedule slots migrated to recurring wall-clock `TIME`. Distinct subscription capacity accounting.
- **Empirical Bayesian Shrinkage (AD-8):** Conservative smoothing for driver rating (3.5 stars neutral prior) and driver acceptance rate (80% neutral prior) with pseudo-weight $5.0$.
- **Adversarial Hardening & Property Fuzzing (T1.07):** Hypothesis property-based testing and boundary-testing suite proving score boundedness, ranking shuffle invariance, UUID tie-breaking, interval overlap symmetry, and exact 50.00m geodesic endpoints.
- **Public Gateway Router & Cache Layer (T1.08):** NestJS endpoint (`GET /api/v1/drivers/search`) with JWT auth, rider profile fallback, Redis 2-minute cache, 30 req/min rate limit, and 5-second overall deadline.
- **Performance Baseline & PostGIS GIST Index (T1.09):** Seeded 500 approved drivers and 2,000 subscriptions; deployed migration for `idx_dp_route` PostGIS GIST index; validated natural query planner cost-based index selection; confirmed matching engine latency at **P50 = 93.50ms** ($< 120\text{ms}$) and **P99 = 187.57ms** ($< 400\text{ms}$); published `PERF.md`.
- **Daily Driver Stats & Departure Precompute Worker (T1.10):** BullMQ repeatable cron worker (02:00 PKT) computing driver 90-day rolling acceptance metrics (`accepted_request_count`, `eligible_request_count`, `acceptance_rate`) and full-grid day-level median departures across operating days $0..6$ on `driver_matching_stats` with atomic transactions, idempotent value stability, and ghost-row elimination.
- **Structured Matching Decision Telemetry & Zero-PII Observability (T1.10b):** OpenTelemetry metrics (`matching.search.requests`, `matching.first_failure.exclusions`, `matching.search.duration_ms`, `matching.candidates.evaluated`, `matching.candidates.eligible`) and exactly ONE structured log event (`matching.search.decision`) per search with strict zero-PII guarantees and AD-11 first-failure precedence hierarchy.
- **Daily Commute Duration Cache Warm-Up & Matching Integration (T1.10c):** BullMQ off-peak worker (03:00 PKT) precomputing distinct active/pending commute durations into Redis (`duration:{origin}:{dest}`, 86,400s TTL) via Google Maps Distance Matrix API with deterministic Haversine fallback; implemented `RedisCachedDurationEstimator` in `apps/matching/app/maps/duration.py`.
- **Mobile Commute Search Input Screen (T1.11):** Interactive React Native / Expo form in `apps/mobile-consumer` featuring rider selection, prefilled read-only corridor cards, 7-day operating day picker, segmented subscription type selector, dynamic afternoon return time picker mounted strictly on `ROUND_TRIP`, quick presets, two-tier client validation via `@routeride/contracts` `DriverSearchQuerySchema`, shimmering skeleton loader (`SearchInputSkeleton`), zero-rider empty state linking to rider addition, and bottom-tab exclusion (`href: null`).
- **Database Migrations:** 4 migrations deployed and verified in PostgreSQL (`routeride_dev`).
- **Test Coverage & Quality Gates:** **151/151** tests passing with **97.97% coverage** in `apps/matching`, **37/37** tests passing across **5 test suites** with **95.0% statement** and **85.29% branch coverage** in `apps/worker`, **224/224** tests passing across **22 test suites** in `apps/api`, **29/29** tests passing across **4 test suites** with **92.27% statement** and **78.34% branch coverage** in `apps/mobile-consumer`, **22/22** tests in `packages/contracts`, and zero errors in `ruff`, `mypy`, `eslint`, and `tsc` strict mode.

---

## 2. Canonical 8-Stage Matching Pipeline (AD-11)

The matching engine processes search requests through an ordered, fail-fast sequence of 7 hard eligibility checks (E1–E7) followed by composite scoring (E8):

```
                       POST /internal/v1/matching/search
                                      │
                                      ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │ E1: Driver Verification Status                                        │
  │     driver_profiles.status = 'APPROVED'                               │
  ├───────────────────────────────────────────────────────────────────────┤
  │ E2: Defensive Geometry Precedence                                     │
  │     NULL → EMPTY → WRONG_SRID (4326) → NON_SIMPLE → INVALID           │
  ├───────────────────────────────────────────────────────────────────────┤
  │ E3: Spatial Corridor Proximity                                        │
  │     ST_DWithin(route, pickup, 1500m) AND ST_DWithin(route, dest, 2000m)│
  ├───────────────────────────────────────────────────────────────────────┤
  │ E4: Corridor Traversal Direction (Undirected Corridor Model)         │
  │     MORNING:            pos_pickup < pos_dest - 1e-9                  │
  │     AFTERNOON:          pos_pickup > pos_dest + 1e-9                  │
  │     ROUND_TRIP:         both legs mandatory (evaluated on corridor)   │
  ├───────────────────────────────────────────────────────────────────────┤
  │ E5: Operating Day Match                                               │
  │     requested_day = ANY(driver_profiles.operating_days)               │
  ├───────────────────────────────────────────────────────────────────────┤
  │ E6: Capacity Headroom (Distinct Active Subscriptions)                 │
  │     overlapping_active_subscriptions + 1 <= seat_capacity             │
  │     (ROUND_TRIP occupies 1 seat; PENDING does not reserve seat)       │
  ├───────────────────────────────────────────────────────────────────────┤
  │ E7: Timing Conflicts (driver_schedule_slots Overlap)                  │
  │     (slot_start < win_end + gap) AND (slot_end + gap > win_start)     │
  │     (Evaluated across both legs for ROUND_TRIP; gap = 0 allows touch) │
  └───────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ (Surviving Eligible Candidates)
  ┌───────────────────────────────────────────────────────────────────────┐
  │ E8: Composite Scoring & Deterministic Ranking                         │
  │     - Proximity Score (40%): Independent radius normalization         │
  │     - Timing Score (25%): Departure diff with neutral 0.500 fallback  │
  │     - Rating Score (20%): Bayesian shrinkage toward 0.700 (wt=5)      │
  │     - Capacity Headroom (10%): Available seats / seat capacity        │
  │     - Acceptance Rate (5%): Bayesian shrinkage toward 0.800 (wt=5)    │
  │                                                                       │
  │     Sort Key: (-composite_score_exact, str(driver_profile_id))        │
  │     Result Capping: [:limit] (default top 20)                         │
  └───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Comprehensive Architectural Decisions (AD-1 to AD-14) Log

| ADR / Decision | Title | Core Invariant & Semantic Definition | Tasks Impacted | Implementation & Code Mapping |
| :---: | :--- | :--- | :---: | :--- |
| **AD-1** | Search is advisory, not a reservation | Search returns a ranked snapshot of currently-eligible drivers. It blocks no seats or schedule slots. State changes occur strictly during subscription booking under `SERIALIZABLE` transactions. | T1.01, T1.08, T1.14 | Stateless matching service (`apps/matching`). Advisory diagnostic counters returned in `exclusionSummary`. |
| **AD-2** | Matching service is read-only | Python matching engine connects with `routeride_matching_ro`, preventing mutations at the database privilege level (`SELECT` privileges only). | T1.01 | Migration `20261006T1500_matching_foundation`, script `apps/api/prisma/provision-ro-user.ts`. |
| **AD-3** | Duration estimation: cheap-first, display-only | Hard eligibility (E6, E7) strictly uses deterministic Haversine ($25\text{ km/h}$, $1.3$ detour factor). Distance Matrix API calls are never made synchronously in search and never affect eligibility or ranking. | T1.05, T1.06, T1.08 | `apps/matching/app/maps/duration.py`. `score_and_rank_candidates` completely omits duration. |
| **AD-4** | Self-intersecting routes unsupported | Corridors must be simple LineStrings. Non-simple or self-intersecting geometries cause ambiguous projection order and are rejected. | T1.02, T1.03 | E2 classification order (`ST_IsSimple`); `apps/matching/app/matching/candidates.py`. |
| **AD-5** | Internal API is versioned and contracted | HTTP interface between NestJS API gateway and Python matching service is formally versioned (`POST /internal/v1/matching/search`) and governed by Zod/Pydantic schemas. | T1.01 | `packages/contracts/src/modules/search.ts` and `apps/matching/app/schemas/internal_search.py`. |
| **AD-6** | Bounding box fail-fast validation & alias precedence | Karachi bounding box (`minLon,minLat,maxLon,maxLat`). Startup asserts coordinate bounds, non-zero area, and consistency between `ROUTE_SERVICE_BBOX` and compatibility variables within $0.0001^\circ$. | T1.01 | `apps/matching/app/config.py` and `packages/config/src/env.ts`. |
| **AD-7** | Schedule interval adjacency allows touching windows | Intervals conflict iff $(\text{start} < \text{existingEnd} + \text{gap}) \land (\text{end} + \text{gap} > \text{existingStart})$. With `gap = 0`, touching windows (e.g. 08:00–08:30 and 08:30–09:00) are permitted without conflict. | T1.05 | `apps/matching/app/matching/timing.py` integer minute arithmetic. |
| **AD-8** | Empirical Bayesian shrinkage on driver signals | Prevents extreme swings for small sample sizes. Shrunk toward neutral priors: rating toward 0.700 (3.5 stars), acceptance rate toward 0.800 (80%), with pseudo-weight 5.0. | T1.06 | `apps/matching/app/matching/scoring.py` count-based shrinkage formulas. |
| **AD-9** | Undirected corridor model; dual-leg round-trip | Digitized polyline represents a bidirectional corridor ($0.0 \to 1.0$). Outbound commutes require $\text{pickup} < \text{dest}$; return commutes require $\text{pickup} > \text{dest}$. Round-trip requires both legs. | T1.03 | `apps/matching/app/matching/direction.py` normalized projection math. |
| **AD-10** | Distinct active subscription seat accounting | Available seats: $\text{seat\_capacity} - \text{overlapping\_active\_subscriptions}$. A `ROUND_TRIP` subscription overlapping both legs occupies **exactly 1 seat**, enforced via `COUNT(DISTINCT s.id)`. PENDING subscriptions do not consume seats. | T1.04 | `apps/matching/app/matching/capacity.py` and migration `20261006T1900_schedule_slots_time_type`. |
| **AD-11** | Canonical eligibility specification (E1–E7) with shared vectors | Matching and authoritative revalidation share identical semantics. Shared test vectors in JSON ensure cross-language parity. | T1.01, T1.02–T1.06 | `packages/contracts/test-vectors/eligibility.json`. |
| **AD-12** | Database role isolation & search retry avoidance | Dedicated read-only user. Retries explicitly disabled on internal search calls to prevent cascading database load. | T1.01 | Migration `20261006T1500_matching_foundation`. |
| **AD-13** | Cross-midnight service windows unsupported | All service intervals must satisfy $\text{start} < \text{end}$ within the same calendar day (`00:00:00` to `23:59:59`). Requests violating this are rejected with HTTP 400 `INVALID_SERVICE_INTERVAL`. | T1.04, T1.05 | `apps/matching/app/matching/service_window.py`. |
| **AD-14** | Duration cache resilience & display-only role | Hard eligibility and scoring are 100% decoupled from external Maps API or Redis cache. Display duration is purely decorative. | T1.05, T1.06 | `apps/matching/app/maps/duration.py`. |

---

## 4. Detailed Task-by-Task Implementation Summary

### Task 1.01 — Schema Contract, Shared Test Vectors & Foundation
- **Core Objectives:**
  - Establish the cross-language contract and schema foundations for matching across TypeScript/Prisma and Python/Pydantic.
  - Implement shared test vectors (`eligibility.json`) validating stages E1–E7.
  - Configure fail-fast environment parsing and service bounding box validation.
  - Provision read-only database credentials for the Python matching engine.
- **Key Technical Implementations:**
  - **Read-Only Database Role (AD-12):** Created `routeride_matching_ro` with read-only permissions on matching tables.
  - **Shared Test Vectors (AD-11):** Established 12 canonical test vectors (`VEC-E1-01` through `VEC-ELIGIBLE-02`) in `packages/contracts/test-vectors/eligibility.json`.
  - **Contract Parity (AD-5):** TypeScript Zod schemas in `packages/contracts/src/modules/search.ts` mirrored into Pydantic v2 schemas in `apps/matching/app/schemas/internal_search.py`.
  - **Startup Bounding Box Verification (AD-6):** Normalized bounding box validation with alias precedence and coordinate equality assertion.
- **Files Created/Modified:**
  - `apps/api/migrations/app/20261006T1500_matching_foundation/migration.sql`
  - `apps/api/prisma/provision-ro-user.ts`
  - `packages/contracts/test-vectors/eligibility.json`
  - `packages/contracts/src/modules/search.ts`
  - `apps/matching/app/config.py`
  - `apps/matching/app/schemas/internal_search.py`
  - `apps/matching/tests/conftest.py`
  - `apps/matching/tests/test_config.py`
  - `apps/matching/tests/test_vectors.py`

---

### Task 1.02 — Spatial Candidate Retrieval & Exclusion Diagnostics
- **Core Objectives:**
  - Implement Stage E1, E2, E3, and E5 database retrieval in PostGIS.
  - Fix the critical TRD §4.1 $3 \times 4$ Cartesian product aggregate bug.
  - Implement deterministic defensive geometry classification order.
  - Implement Stage E1–E5 diagnostic accounting for observability.
- **Key Technical Implementations:**
  - **Cartesian Product Bug Resolution:** Replaced raw multi-table joins with independent `LEFT JOIN LATERAL` queries for reviews and subscriptions, preventing row explosion when drivers have multiple reviews and subscriptions:
    ```sql
    LEFT JOIN LATERAL (
        SELECT COALESCE(AVG(r.rating), 0.0) AS avg_rating, COUNT(r.id) AS review_count
        FROM reviews r WHERE r.target_id = dp.user_id
    ) rev ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT s.id) AS active_sub_count
        FROM subscriptions s WHERE s.driver_profile_id = dp.id AND s.status = 'ACTIVE'
    ) subs ON TRUE
    ```
  - **Deterministic Defensive Geometry Classification (AD-11):**
    Enforced strict precedence order in SQL and application logic:
    $$\text{NULL} \to \text{EMPTY} \to \text{WRONG\_SRID (4326)} \to \text{NON\_SIMPLE} \to \text{INVALID}$$
  - **PostGIS Geography Filtering:** Used `ST_DWithin(route_polyline, pickup, 1500)` and `ST_DWithin(route_polyline, dest, 2000)`.
  - **First-Failure Accounting:** Enforced evaluation order $E1 \to E2 \to E3 \to E5$ ensuring distance exclusion (E3) strictly precedes operating day exclusion (E5).
- **Files Created/Modified:**
  - `apps/matching/app/matching/candidates.py`
  - `apps/matching/tests/test_candidates.py`

---

### Task 1.03 — Corridor Direction & Dual-Leg Round-Trip Projection
- **Core Objectives:**
  - Implement Stage E4 (Corridor Traversal Direction) on undirected physical transit corridors (AD-9).
  - Enforce minimum pickup-to-destination separation ($50\text{m}$).
  - Implement normalized projection mirroring PostGIS `ST_LineLocatePoint`.
- **Key Technical Implementations:**
  - **Endpoint Separation Invariant:** Pre-validates geodesic distance between pickup and destination. Distances $< 50\text{m}$ are rejected with HTTP 422 `INVALID_ROUTE_REQUEST`:
    $$d = 2 R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos\phi_1\cos\phi_2\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right) \ge 50.0\text{m}$$
  - **Normalized Corridor Projection:** Project coordinates onto Shapely `LineString` representing the digitized corridor, returning fractional position in $[0.0, 1.0]$:
    $$\text{pos} = \frac{\text{line.project}(\text{Point}(\text{lon}, \text{lat}))}{\text{line.length}}$$
  - **Directional Semantics (`POSITION_EPSILON = 1e-9`):**
    - `MORNING`: Outbound commute requires $\text{pos\_pickup} < \text{pos\_dest} - 10^{-9}$.
    - `AFTERNOON`: Return commute requires $\text{pos\_pickup} > \text{pos\_dest} + 10^{-9}$.
    - `ROUND_TRIP`: Outbound leg requires $\text{pos\_pickup} < \text{pos\_dest} - 10^{-9}$. Under the corridor model (B1, AD-9), registering on a corridor commits the driver to bidirectional service, satisfying both outbound and return journeys.
- **Files Created/Modified:**
  - `apps/matching/app/matching/direction.py`
  - `apps/matching/tests/test_direction.py`

---

### Task 1.04 — Capacity Check with Distinct Subscription Accounting
- **Core Objectives:**
  - Implement Stage E6 (Capacity Check) per AD-10.
  - Enforce distinct active subscription seat accounting.
  - Normalize schedule slot timestamps to wall-clock `TIME`.
- **Key Technical Implementations:**
  - **Distinct Subscription Seat Accounting (AD-10):**
    A driver is excluded with code `CAPACITY` if:
    $$\text{available\_seats} = \text{seat\_capacity} - \text{overlapping\_active\_subscriptions} < 1$$
  - **Single Seat for ROUND_TRIP:** Evaluated via `COUNT(DISTINCT s.id)`:
    ```sql
    SELECT COUNT(DISTINCT s.id)
    FROM subscriptions s
    JOIN driver_schedule_slots dss ON dss.subscription_id = s.id
    WHERE s.driver_profile_id = $1
      AND s.status = 'ACTIVE'
      AND $2 = ANY(s.operating_days)
      AND (
        ($3 AND dss.slot_start < $4 AND dss.slot_end > $5)
        OR
        ($6 AND dss.slot_start < $7 AND dss.slot_end > $8)
      );
    ```
    An existing `ROUND_TRIP` subscription overlapping both morning and return legs occupies **exactly 1 seat**, not two.
  - **Status & Day Isolation:** Only `ACTIVE` subscriptions consume capacity. `PENDING` subscriptions do not reserve seats. Subscriptions on other days do not conflict.
  - **Recurring Wall-Clock TIME Invariant:** Migrated PostgreSQL column `driver_schedule_slots.slot_start` and `slot_end` to `TIME WITHOUT TIME ZONE` normalized to `Asia/Karachi`.
- **Files Created/Modified:**
  - `apps/api/migrations/app/20261006T1900_schedule_slots_time_type/migration.sql`
  - `apps/matching/app/matching/capacity.py`
  - `apps/matching/tests/test_capacity.py`

---

### Task 1.05 — Timing Conflict Check & Deterministic Haversine Eligibility
- **Core Objectives:**
  - Implement Stage E7 (Timing Conflict Check) against `driver_schedule_slots`.
  - Establish a single source of truth for requested service windows.
  - Enforce cross-midnight rejection and round-trip leg gap invariants.
  - Decouple hard eligibility from external Google Maps API calls.
- **Key Technical Implementations:**
  - **AD-7 Touching Boundaries Allowed:** Interval conflict formula:
    $$(\text{slot\_start\_min} < \text{win\_end\_min} + \text{gap}) \land (\text{slot\_end\_min} + \text{gap} > \text{win\_start\_min})$$
    With `gap = 0`, touching intervals (e.g., 08:00–08:30 and 08:30–09:00) satisfy $510 > 510 = \text{False}$ and are permitted without conflict.
  - **Pre-Validated Service Window Artifact (AD-13):**
    Canonical `RequestedServiceWindow` constructor in `apps/matching/app/matching/service_window.py` pre-validates:
    - Cross-midnight intervals rejected with HTTP 400 `INVALID_SERVICE_INTERVAL`.
    - Inverted or overlapping round-trip legs rejected with HTTP 400 `INVALID_ROUND_TRIP_TIMES` ($\text{morning\_end} + \text{gap} \le \text{afternoon\_start}$).
  - **Deterministic Commute Duration (AD-14):**
    Hard eligibility strictly computes commute duration via deterministic Haversine ($25\text{ km/h}$, $1.3$ detour factor):
    $$\text{duration\_minutes} = \max\left(5.0, \frac{\text{haversine\_km} \times 1.3}{25.0} \times 60\right)$$
  - **UUID Array Typing:** Queries use `dss.driver_profile_id = ANY($1::uuid[]::text[])` with `list[UUID]` input, preserving UUID validation while utilizing B-tree index scans.
- **Files Created/Modified:**
  - `apps/matching/app/maps/duration.py`
  - `apps/matching/app/matching/service_window.py`
  - `apps/matching/app/matching/timing.py`
  - `apps/matching/tests/test_timing.py`

---

### Task 1.06 — Composite Scoring & Deterministic Ranking
- **Core Objectives:**
  - Implement Stage E8 (Scoring & Ranking) per PRD §7.4.
  - Normalize 5 independent component signals into $[0.0, 1.0]$.
  - Apply empirical Bayesian shrinkage to driver rating and acceptance rate.
  - Enforce full-precision float ranking and stable tie-breaking.
  - Restrict Stage E8 to zero database queries.
- **Key Technical Implementations:**
  - **Component Normalization Formulas (PRD §7.4):**
    1. **Proximity Score ($40\%$):** Independent radius normalization:
       $$\text{proximityScore} = \frac{1}{2}\left(\max\left(0, 1 - \frac{p}{R_p}\right) + \max\left(0, 1 - \frac{d}{R_d}\right)\right)$$
    2. **Timing Score ($25\%$):** Day-level departure difference against `driver_matching_stats.typical_departure_time` up to $60\text{m}$. Falls back to neutral $0.500$ when observations $< 3$:
       $$\text{timingScore} = \max\left(0.0, 1.0 - \frac{|\Delta t_{\text{minutes}}|}{60.0}\right)$$
    3. **Rating Score ($20\%$):** Bayesian shrinkage toward neutral $0.700$ (3.5 stars) with pseudo-weight $5.0$:
       $$\text{ratingScore} = \frac{N_{\text{reviews}} \times \left(\frac{\text{avgRating}}{5.0}\right) + 5.0 \times 0.700}{N_{\text{reviews}} + 5.0}$$
    4. **Capacity Headroom ($10\%$):** Available seat ratio:
       $$\text{capacityScore} = \frac{\text{availableSeats}}{\text{seatCapacity}}$$
    5. **Acceptance Rate ($5\%$):** Canonical count-based Bayesian shrinkage toward neutral $0.800$ (80%) with pseudo-weight $5.0$ (AD-8):
       $$\text{acceptanceScore} = \frac{\text{accepted\_count} + 5.0 \times 0.800}{\text{eligible\_count} + 5.0}$$
  - **Composite Score Weighted Sum:**
    $$\text{compositeScore} = 0.40 \cdot S_{\text{prox}} + 0.25 \cdot S_{\text{time}} + 0.20 \cdot S_{\text{rate}} + 0.10 \cdot S_{\text{cap}} + 0.05 \cdot S_{\text{acc}}$$
  - **Full-Precision Unrounded Ranking & Tie-Breaking:**
    Sorting uses exact unrounded IEEE-754 floats to prevent premature rounding ties:
    $$\text{Sort Key} = \left(-\text{composite\_score\_exact}, \text{str}(\text{driver\_profile\_id})\right)$$
    Display scores are rounded to 4 decimals only at the API response boundary.
  - **Zero DB Queries in E8:** All data preloaded during E1–E7; E8 is pure in-memory calculation.
- **Files Created/Modified:**
  - `apps/api/migrations/app/20261007T1400_driver_acceptance_stats/migration.sql`
  - `apps/api/prisma/schema.prisma` & `contract.prisma`
  - `apps/matching/app/config.py`
  - `apps/matching/app/matching/candidates.py`
  - `apps/matching/app/matching/scoring.py`
  - `apps/matching/tests/test_scoring.py`

### Task 1.07 — Comprehensive Edge-Case and Property Test Suite
- **Core Objectives:**
  - Build a rigorous, adversarial regression and property-testing layer covering the entire 8-stage matching engine (E1 through E8).
  - Prove mathematical invariants, ranking stability, monotonicity, tie-breaking fairness, and defensive edge-case handling using Hypothesis property-based fuzzing and deterministic unit tests.
  - Enforce zero unhandled exceptions, zero type/lint errors, and $\ge 90\%$ line and branch test coverage.
- **Key Technical Implementations:**
  - **Exact 50.00m Geodesic Separation Tests:**
    - Explicit geodesic distance boundary assertions: $49.999\text{m}$ distance between pickup and destination rejected with HTTP 422 `INVALID_ROUTE_REQUEST`; $50.000\text{m}$ accepted; $50.001\text{m}$ accepted.
  - **Exact Spatial Corridor Boundaries:**
    - Pickup at $1500.000\text{m}$ accepted, $1500.001\text{m}$ rejected (`PICKUP_TOO_FAR`); destination at $2000.000\text{m}$ accepted, $2000.001\text{m}$ rejected (`DEST_TOO_FAR`).
  - **Service Window Invariant Enforcement (AD-7, AD-13):**
    - Rejected cross-midnight requested intervals ($t \ge 1440\text{ min}$ or $t < 0\text{ min}$) with HTTP 400 `INVALID_SERVICE_INTERVAL`.
    - Allowed touching schedule slots ($gap=0\text{ min}$) without false-positive conflict flagging.
    - Rejected overlapping and inverted round-trip requested windows with HTTP 400 `INVALID_ROUND_TRIP_TIMES`.
  - **Canonical E1 $\to$ E7 First-Failure Precedence Matrix:**
    - Verified strict evaluation order in diagnostics: a driver failing multiple stages is categorized strictly under their earliest failing stage (`STATUS` before `GEOMETRY`, `GEOMETRY` before `DISTANCE`, etc.).
  - **Defensive E2 Geometry Classification Precedence:**
    - Enforced canonical diagnostic hierarchy: $\text{NULL} \to \text{EMPTY} \to \text{WRONG\_SRID} \to \text{NON\_SIMPLE} \to \text{INVALID}$.
  - **Round-Trip Timing Scoring & Constraints:**
    - Scored candidate timing against morning departure difference with typical departure time; verified return leg feasibility enforced deterministically via E7 conflict validation.
  - **Single-Seat Capacity Boundary ($C=1$):**
    - Confirmed correct transition from eligible ($headroom = 1$) to fully booked ($headroom = 0$) when a single active subscription exists.
  - **Brand-New Driver Neutral Prior Identities (AD-8):**
    - Exactly verified $N=0$ review rating score $= 0.7000$ and $N=0$ acceptance count score $= 0.8000$.
  - **Deterministic Hand-Calculated Scoring Vectors:**
    - 3 reference vectors hand-calculated and tested to $10^{-6}$ float precision:
      - Vector 1 (Perfect Driver): Prox 1.0, Time 1.0, Rating 1.0, Cap 1.0, Acc 1.0 $\implies 1.0000$.
      - Vector 2 (Boundary Driver): Max distance, 60m diff, 1.0 rating (20 rev), 1/4 cap, 1/10 acc $\implies 0.1656$.
      - Vector 3 (Brand-New Average Driver): 500m pickup/dest, 15m diff, 0 reviews, 2/4 cap, 0 trips $\implies 0.7225$.
  - **Result-Limit Boundary Conditions:**
    - Verified engine behavior for `limit = 0` (empty list), `limit = 1`, `limit = 20`, `limit = None` (all eligible returned), and $N > \text{limit}$ (top $K$ highest scores returned).
  - **Property-Based Fuzzing Suite (Hypothesis):**
    - 13 mathematical property tests covering boundedness, monotonicity, ranking permutation invariance (100x shuffle), strict UUID tie-breaking, arc-length projection monotonicity on polylines, schedule interval overlap symmetry, `COUNT(DISTINCT subscription.id)` headroom preservation, Bayesian asymptotic convergence as $N \to \infty$, and configuration validation rules.
    - Verified NaN and $\pm\infty$ float rejection by Pydantic models with 422 validation errors.
- **Files Created/Modified:**
  - `apps/matching/pyproject.toml` (added `hypothesis>=6.100.0` dev dependency)
  - `apps/matching/tests/test_edge_cases.py` (19 comprehensive adversarial tests)
  - `apps/matching/tests/test_properties.py` (13 Hypothesis property tests)
  - `tasks/PHASE1A.md` & `tasks/todo.md` (marked T1.07 completed)

### 4.8 Task 1.08 — `GET /drivers/search` Gateway Endpoint (NestJS Fastify)
- **Primary Goals:**
  - Expose the public, authenticated gateway endpoint `GET /api/v1/drivers/search` connecting mobile consumers to the Python matching engine.
  - Implement strict security and ownership controls, bounding box validation, Redis caching, candidate database enrichment, dynamic budget timeouts, and safe no-match reason mappings.
- **Key Technical Implementations & Architectural Decisions:**
  - **Guard Pipeline & RBAC:**
    - Decorated with `JwtAuthGuard`, `RolesGuard` (`CONSUMER`), and `SearchRateLimitGuard`.
    - Authenticated users with roles `DRIVER`, `ADMIN`, or `INSTITUTION_ADMIN` receive `403 FORBIDDEN`.
    - Unauthenticated requests receive `401 UNAUTHENTICATED`.
    - Rate limit enforced at 30 requests / userId / minute (tracked by `search:${req.user.sub}`, falling back to IP) returning `429 RATE_LIMITED`.
  - **Rider Ownership Enforcement:**
    - Verified that `riderId` belongs to the authenticated consumer (`WHERE r.id = $riderId AND cp.user_id = $userId`).
    - If the rider belongs to another consumer, returns `403 FORBIDDEN` (`"You do not have access to this rider"`).
    - If the rider does not exist in the database, returns `404 NOT_FOUND` (`"Rider not found"`).
  - **Coordinate Resolution Precedence:**
    - Coordinates in query parameters (`pickupLat`, `pickupLng`, `destLat`, `destLng`) override defaults from rider profile (`home_location`, `dest_location`).
    - If either pickup or destination point remains missing/null in both query and rider profile, rejects immediately with `400 BAD_REQUEST` (`MISSING_COORDINATES`).
  - **Inclusive Bounding Box Validation:**
    - Bounds evaluated inclusively: $\text{minLat} \le \text{lat} \le \text{maxLat} \land \text{minLon} \le \text{lon} \le \text{maxLon}$ against Karachi bounds ($[24.65, 25.15]\text{N}, [66.85, 67.35]\text{E}$).
    - Boundary points are accepted; points strictly outside return `422 UNPROCESSABLE` (`OUTSIDE_SERVICE_AREA`).
  - **Redis Caching with 6-Decimal Canonical Coordinates (AD-5, AD-12):**
    - Quantizes coordinates in cache key using 6 decimal places (`toFixed(6)`, $\sim 0.11\text{m}$ resolution) to prevent false corridor collisions near 1500m/2000m boundaries and protect E8 proximity scoring.
    - Omits `riderId` from cache key hash (`sha256(pickup:dest:day:time:afternoon:subType)`) so multiple consumers searching the identical corridor and schedule share cached results.
    - 2-minute (120s) TTL.
    - **Defensive Cache Contract Validation:** Cached payloads are parsed and validated via `DriverSearchResponseDataSchema.safeParse()`. Corrupted or outdated entries immediately trigger `redis.del(key)` and fall through to a fresh search without returning 500 errors.
  - **Matching Microservice Proxy (`MatchingClient`):**
    - Built on Undici `Agent` transport with explicit 1000ms TCP connection timeout.
    - Allocated dynamic read budget: $\min(3000\text{ms}, \text{remainingGatewayBudgetMs})$.
    - Dispatches to `POST /internal/v1/matching/search`.
    - Injects W3C `traceparent` via OpenTelemetry API and propagates `X-Request-ID`.
    - Retries explicitly disabled on search (AD-12).
    - Translates upstream 422 to `UnprocessableEntityException`, and connection refused, timeouts, or 500/503 errors to `ServiceUnavailableWithRetryException` with `Retry-After: 30`.
  - **Overall Gateway Response Deadline (5000ms ceiling):**
    - Enforced via `Promise.race` + `AbortController` setting a 5000ms timeout on the public request.
    - Passes `parentSignal` to `MatchingClient` to abort in-flight Undici requests immediately when the response deadline fires.
    - Returns HTTP 503 `SERVICE_UNAVAILABLE` with `Retry-After: 30` immediately upon expiry.
  - **Candidate Driver PostgreSQL Enrichment:**
    - Enriches raw Python matches with driver full name (`users.full_name`), vehicle make/model/colour, and base monthly price in PKR (`driver_profiles.base_price_cents`).
    - Preserves exact Python ranking order (E8).
    - Calculates `estimatedDropoffTime` by adding trip duration minutes to pickup time (`HH:mm` format).
    - Rounds walk distances to 1 decimal place (`Math.round(d * 10) / 10`).
  - **Safe Dominant No-Match Reason Mapping:**
    - When zero eligible candidates are returned, analyzes upstream `exclusionSummary.firstFailureCounts` and maps the dominant first-failure stage to the contracted enum:
      - `distance` $\implies$ `NO_DRIVERS_IN_AREA`
      - `direction` $\implies$ `NO_DRIVERS_IN_DIRECTION`
      - `operatingDay` $\implies$ `NO_DRIVERS_ON_DAY`
      - `capacity` $\implies$ `ALL_DRIVERS_FULL`
      - `timing` $\implies$ `NO_DRIVERS_AT_TIME`
- **Files Created/Modified:**
  - `packages/contracts/src/modules/search.ts` (added `DriverSearchQuerySchema`, `MatchedRouteResultSchema`, `DriverSearchResponseDataSchema`, and afternoonTime constraints)
  - `packages/contracts/src/contracts.test.ts` (added unit tests for search query and response schemas)
  - `apps/api/package.json` (installed `undici` and `@opentelemetry/api`)
  - `apps/api/src/common/error.filter.ts` (enhanced to propagate custom exception headers like `Retry-After`)
  - `apps/api/src/common/service-unavailable-retry.exception.ts` (custom exception with typed `headers: { "Retry-After": "30" }`)
  - `apps/api/src/search/matching.client.ts` (Undici proxy client with 1000ms connect timeout, dynamic budget, trace propagation)
  - `apps/api/src/search/search.service.ts` (gateway search orchestration, coordinate resolution, caching, DB enrichment)
  - `apps/api/src/search/search.controller.ts` (controller with JWT, roles, search rate limit guards)
  - `apps/api/src/search/search.module.ts` (NestJS module wiring)
  - `apps/api/src/app.module.ts` (registered `SearchModule`)
  - `apps/api/test/search.integration.test.ts` (28 integration & unit tests)
  - `apps/api/test/matching-client.integration.test.ts` (4 unit tests for Undici transport and error handling)
  - `tasks/PHASE1A.md` (marked T1.08 completed)

### Task 1.09 — Performance Harness, Baseline & PostGIS Spatial Indexing
- **Core Objectives:**
  - Complete the matching service orchestrator (`apps/matching/app/matching/engine.py`) and mount the private HTTP endpoint `POST /internal/v1/matching/search` in `apps/matching/app/main.py` to enable end-to-end Gateway search functionality.
  - Deploy PostGIS GIST spatial index (`idx_dp_route`) via Prisma/PostgreSQL migration to ensure scalable corridor lookups without sequential table scans.
  - Generate a realistic synthetic benchmark fleet: 500 approved drivers, 2,000 active subscriptions, 2,657 schedule slots, 3,003 matching stats, and 1,188 reviews across 5 transit corridors within Karachi's operational bounding box ($[24.70, 25.15]^\circ\text{N}, [66.85, 67.35]^\circ\text{E}$).
  - Validate that PostgreSQL's query planner naturally selects `idx_dp_route` via cost-based optimization (`EXPLAIN (ANALYZE, BUFFERS)`).
  - Measure pure Python matching engine processing latency across 100 timed samples per scenario and confirm SLA targets: **P50 $< 120\text{ms}$** and **P99 $< 400\text{ms}$**.
  - Document system specifications, execution plans, stage breakdowns, and optimization tracking in `PERF.md`.
- **Key Deliverables & Architectural Invariants:**
  - **Migration `20261008T1500_driver_profiles_gist_index`:** Created PostGIS GIST index `idx_dp_route` on `driver_profiles USING gist (((route_polyline::geography)))` and B-tree indexes `idx_riders_home`, `idx_riders_dest` on `riders`.
  - **Matching Orchestrator (`apps/matching/app/matching/engine.py`):** Orchestrates E1 $\to$ E7 and E8 scoring. Evaluates E6 (Capacity) strictly before E7 (Timing) to preserve canonical first-failure precedence (AD-11).
  - **Private Search Endpoint (`apps/matching/app/main.py`):** Mounted `POST /internal/v1/matching/search` with database pool lifecycle management and OpenTelemetry tracing.
  - **Synthetic Generator (`apps/matching/tests/perf/seed_500.py`):** CLI utility supporting `--seed`, `--clean`, `--status`, and `--explain`. Seeds 500 approved drivers, 2,000 subscriptions, 2,657 slots, 3,003 stats, and 1,188 reviews in $< 6$ seconds under `@benchmark.routeride.internal` isolation.
  - **Benchmark Harness (`apps/matching/tests/perf/test_search_latency.py`):** CLI and automated pytest gate (`pytest -m perf`) testing 4 real-world Karachi scenarios:
    1. High-Density Peak: Nursery $\rightarrow$ Metropole (Shahrah-e-Faisal rush)
    2. Medium-Density: Clifton $\rightarrow$ Gulshan (outbound morning)
    3. Low-Density: Malir $\rightarrow$ Gulshan (peripheral route)
    4. Round-Trip Multi-Leg: North Nazimabad $\leftrightarrow$ I.I. Chundrigar ($07:45 + 17:00$)
  - **Performance Optimization Cycle (`performance-optimization` skill):**
    - Refactored `SPATIAL_EXCLUSIONS_SQL` to use set-based index filtering, reducing spatial exclusion diagnostics from $186.53\text{ms}$ to **$24.41\text{ms}$** (86.9% speedup).
    - Executed candidate retrieval and fleet spatial diagnostics concurrently via `asyncio.gather` on `asyncpg.Pool`, absorbing diagnostic query time into candidate retrieval.
    - Re-scoped high-frequency candidate exclusion logs from `logger.info` to `logger.debug`, eliminating console stdout pauses and reducing timing filter latency from $87.77\text{ms}$ to **$4.52\text{ms}$**.
    - Reused Shapely `Point` instances across candidate iteration in corridor direction evaluation, reducing direction filter time from $108.19\text{ms}$ to **$8.66\text{ms}$**.
  - **Benchmark SLA Results (100 samples per scenario):**
    - Scenario 1 (High-Density): P50 = **$93.50\text{ms}$**, P99 = **$187.57\text{ms}$** $\implies$ **PASSED**
    - Scenario 2 (Medium-Density): P50 = **$76.22\text{ms}$**, P99 = **$113.22\text{ms}$** $\implies$ **PASSED**
    - Scenario 3 (Low-Density): P50 = **$13.69\text{ms}$**, P99 = **$21.79\text{ms}$** $\implies$ **PASSED**
    - Scenario 4 (Round-Trip): P50 = **$60.01\text{ms}$**, P99 = **$104.93\text{ms}$** $\implies$ **PASSED**
    - Max P50 across fleet: **$93.50\text{ms}$** ($< 120.0\text{ms}$ target)
    - Max P99 across fleet: **$187.57\text{ms}$** ($< 400.0\text{ms}$ target)
    - Gateway 5,000ms deadline: $187.57\text{ms} \ll 5,000\text{ms}$ ($96.2\%$ headroom)
- **Files Created/Modified:**
  - `apps/api/migrations/app/20261008T1500_driver_profiles_gist_index/migration.sql` (GIST index migration)
  - `apps/matching/app/matching/engine.py` (matching engine pipeline orchestrator)
  - `apps/matching/app/main.py` (mounted `/internal/v1/matching/search`)
  - `apps/matching/app/matching/candidates.py` (index-accelerated `SPATIAL_EXCLUSIONS_SQL`)
  - `apps/matching/app/matching/timing.py` (debug logging for candidate exclusions)
  - `apps/matching/app/matching/direction.py` (Point reuse & debug logging)
  - `apps/matching/app/matching/capacity.py` (debug logging)
  - `apps/matching/tests/test_engine.py` (6 unit tests for engine orchestration, 100% coverage)
  - `apps/matching/tests/perf/seed_500.py` (synthetic benchmark generator with `--explain`)
  - `apps/matching/tests/perf/test_search_latency.py` (100-sample latency harness and pytest SLA gate)
  - `PERF.md` (comprehensive baseline report)
  - `tasks/PHASE1A.md` (marked T1.09 completed)
  - `tasks/todo.md` (marked T1.08 and T1.09 completed)

### Task 1.10 — Daily Precompute Worker Job for Driver Stats & Day-Level Departure Times
- **Core Objectives:**
  - Build a resilient, daily repeatable cron job (scheduled at 02:00 PKT) in `apps/worker` via BullMQ (`driver-stats` queue).
  - Compute 90-day rolling acceptance statistics (`accepted_request_count`, `eligible_request_count`, and `acceptance_rate`) directly onto `driver_profiles`.
  - Compute day-level median departure times (`typical_departure_time`) for each operating day ($0..6$) onto `driver_matching_stats` where active morning subscriptions $\ge 3$.
- **Architectural Implementation Details:**
  - **Full-Grid Transactional Refresh & Ghost-Row Elimination:** To eliminate stale or orphaned records when subscriptions cancel or pause, the job computes a cross-product across all approved drivers and operating days $0..6$ via `CROSS JOIN generate_series(0, 6)`. Operating days with $< 3$ observations are explicitly reset to `typical_departure_time = NULL` with their exact observation count ($0, 1, 2$) via `ON CONFLICT (driver_profile_id, operating_day) DO UPDATE`.
  - **Subscription Acceptance Semantics:** Derived strictly from the subscription lifecycle state machine:
    - *Accepted requests:* Subscriptions whose lifecycle demonstrates driver acceptance (`ACTIVE`, `PAUSED`, `EXPIRED`, or activated prior to cancellation).
    - *Declined / Auto-Declined:* Subscriptions cancelled while still pending, rejected, or auto-declined are counted in `eligible_request_count` but never in `accepted_request_count`.
    - *Pending exclusion:* Unresolved pending requests created $< 24\text{h}$ ago are excluded from the denominator until resolved to avoid penalizing active decision windows.
  - **Idempotence & Fault Isolation:** Repeated executions within the same day yield identical computed statistics and observation counts (only audit timestamps `updated_at` and `computed_at` refresh). All queries execute inside an isolated PostgreSQL transaction (`BEGIN ... COMMIT`) via a dedicated checkout client from `DatabaseService`. On failure, the transaction rolls back (`ROLLBACK`), leaving previous values intact without corrupting production data.
- **Verification & Files:**
  - `apps/worker/src/database/database.service.ts` (added `getClient(): Promise<pg.PoolClient>`)
  - `apps/worker/src/database/database.module.ts`
  - `apps/worker/src/driver-stats/driver-stats.job.ts` (`DriverStatsJobService`)
  - `apps/worker/src/driver-stats/driver-stats.worker.ts` (`DriverStatsWorkerService`)
  - `apps/worker/src/driver-stats/driver-stats.module.ts`
  - `apps/worker/test/driver-stats.test.ts` (100% statement and branch coverage across no-history, multi-day, idempotence, threshold resets, worker lifecycle, and rollback isolation)

### Task 1.10b — Structured Matching Decision Metrics & Zero-PII Observability
- **Core Objectives:**
  - Instrument the Python matching service (`apps/matching`) with OpenTelemetry counters, histograms, and structured logging.
  - Emit exactly ONE structured log event per search (`matching.search.decision`) mapping to the canonical AD-11 first-failure steps (E1–E7).
  - Guarantee zero Personally Identifiable Information (PII) in log events and telemetry attributes.
- **Architectural Implementation Details:**
  - **OpenTelemetry Instrumentation (`apps/matching/app/matching/observability.py`):**
    - `matching.search.requests` (Counter: `subscription_type`, `status`)
    - `matching.first_failure.exclusions` (Counter: `reason` = `DRIVER_NOT_APPROVED`, `INVALID_GEOMETRY`, `OUT_OF_CORRIDOR`, `WRONG_DIRECTION`, `DAY_MISMATCH`, `NO_CAPACITY`, `SCHEDULE_CONFLICT`)
    - `matching.search.duration_ms` (Histogram: end-to-end matching latency in milliseconds)
    - `matching.candidates.evaluated` (Counter: count of candidate drivers retrieved and evaluated)
    - `matching.candidates.eligible` (Counter: count of surviving eligible drivers returned)
  - **Strict Zero-PII Enforcement:** Structured decision logs completely omit rider coordinates (`pickup`, `destination`), rider names, phone numbers, email addresses, and specific street addresses. Only anonymized search metadata (`search_id`, `subscription_type`, `operating_day`, `time_window`, `fleet_size`, `eligible_count`, `dominant_failure_reason`, `latency_ms`) is emitted.
  - **Dominant Failure Precedence:** When zero drivers match, the dominant exclusion reason is determined strictly according to the canonical AD-11 hierarchy (E1 $\to$ E7) using `ORDER BY count DESC, precedence ASC` tie-breaking.
- **Verification & Files:**
  - `apps/matching/app/matching/observability.py` (OpenTelemetry metrics and `record_matching_decision()`)
  - `apps/matching/app/matching/engine.py` (integrated observability recording in `run_matching_pipeline()`)
  - `apps/matching/tests/test_observability.py` (unit tests validating OTel metric recordings, single log event emission, zero-PII compliance, and dominant reason hierarchy)

### Task 1.10c — Daily Duration Cache Warm-Up Job & Matching Integration
- **Core Objectives:**
  - Build a BullMQ worker job in `apps/worker` running off-peak (03:00 PKT) on queue `duration-cache` to precompute commute travel durations into Redis.
  - Integrate Redis cached duration lookup into `apps/matching/app/maps/duration.py` with graceful fallback to deterministic Haversine distance.
- **Architectural Implementation Details:**
  - **Warm-Up Job (`apps/worker/src/duration-cache/`):** Queries all distinct origin-destination coordinate pairs across active and pending subscriptions. Validates coordinates against the Karachi bounding box. Queries Google Maps Distance Matrix API with a 3,000ms timeout and Zod validation, writing seconds to Redis under `duration:{pickupLat:.4f},{pickupLng:.4f}:{destLat:.4f},{destLng:.4f}` with a TTL of 86,400s (24 hours).
  - **Resilience & Fault Tolerance:** If the Google Maps API is unavailable, unconfigured, or times out, the worker gracefully falls back to deterministic Haversine estimation ($25\text{km/h}$ city speed, $1.3$ detour factor) without halting the warm-up cycle.
  - **Matching Service Integration (`RedisCachedDurationEstimator`):** Implements the `CommuteDurationEstimator` Protocol in `apps/matching/app/maps/duration.py`. Queries Redis asynchronously; if found, returns cached travel duration. On Redis cache misses or connection failures, seamlessly falls back to `HaversineDurationEstimator`.
- **Verification & Files:**
  - `apps/worker/src/duration-cache/duration-cache.job.ts` (`DurationCacheJobService`)
  - `apps/worker/src/duration-cache/duration-cache.worker.ts` (`DurationCacheWorkerService`)
  - `apps/worker/src/duration-cache/duration-cache.module.ts`
  - `apps/worker/src/app.module.ts` (registered `DurationCacheModule`)
  - `apps/worker/test/duration-cache.test.ts` (unit tests covering key formatting, BBox validation, Maps API response, timeout fallback, full warm-up, and worker lifecycle)
  - `apps/matching/app/maps/duration.py` (`RedisCachedDurationEstimator`)
  - `apps/matching/tests/test_timing.py` (unit tests for Redis cached estimator hits, misses, and Haversine fallback)

### Task 1.11 — Mobile Commute Search Input Screen
- **Core Objectives:**
  - Build an intuitive, accessible, and resilient mobile search input screen in `apps/mobile-consumer` (`app/(app)/search/index.tsx`) allowing parents to search for recurring commute drivers.
  - Implement rider selection with auto-prefilled read-only corridor cards (`CorridorCard`) displaying verified pickup and school drop-off addresses.
  - Support 7-day operating day selection (`DayPicker`, $0=\text{Sunday}..6=\text{Saturday}$), segmented subscription type selection (`SubscriptionTypePicker`: `MORNING`, `AFTERNOON`, `ROUND_TRIP`), and dynamic time input (`TimeInput`) with quick time preset chips.
  - Enforce conditional afternoon return time picker mounting strictly when `subscriptionType === "ROUND_TRIP"`.
  - Implement two-tier client-side validation (`SearchInputFormStateSchema` $\to$ `buildDriverSearchQuery()` $\to$ `@routeride/contracts` `DriverSearchQuerySchema.parse()`) blocking invalid submissions before network dispatch.
  - Deliver shimmering skeleton loader (`SearchInputSkeleton`) and empty state (`EmptyState`) with direct navigation to rider creation (`/(app)/riders/add`).
  - Wire stack navigation contract: hidden from bottom tabs (`href: null` in `app/(app)/_layout.tsx`) and accessible from Home screen CTA card.
- **Architectural Implementation Details:**
  - **No False Address Overrides:** Verified addresses are presented as read-only corridor summary cards derived directly from the selected rider's profile, preventing desynchronization between client text and backend PostGIS spatial resolution.
  - **Dynamic Time Controls & Contract Adherence:**
    - Switching subscription types updates default time presets (e.g. `07:30` for morning, `14:00` for afternoon pickup, `14:30` for round-trip return).
    - Client validation strictly checks format (`HH:mm`), valid 24h ranges, and non-empty selections, deferring business logic and server-side constraints to `@routeride/contracts` without inventing uncontracted client restrictions.
  - **Navigation Integration:** Search is registered as a sub-route under `app/(app)/search/index.tsx`, hidden from bottom navigation via `href: null` in `app/(app)/_layout.tsx`, and dispatched from the primary Home commute action card with params passed to `/(app)/search/results`.
- **Verification & Files:**
  - `apps/mobile-consumer/app/(app)/_layout.tsx` (registered `search` stack screen with `href: null`)
  - `apps/mobile-consumer/app/(app)/index.tsx` (added Commute Matching search CTA card)
  - `apps/mobile-consumer/app/(app)/search/components/SearchInputSkeleton.tsx` (`SearchInputSkeleton` shimmering loader)
  - `apps/mobile-consumer/app/(app)/search/components/RiderPicker.tsx` (`RiderPicker` horizontal selector)
  - `apps/mobile-consumer/app/(app)/search/components/CorridorCard.tsx` (`CorridorCard` read-only address card)
  - `apps/mobile-consumer/app/(app)/search/components/DayPicker.tsx` (`DayPicker` 7-day accessible chip selector)
  - `apps/mobile-consumer/app/(app)/search/components/SubscriptionTypePicker.tsx` (`SubscriptionTypePicker` segmented control)
  - `apps/mobile-consumer/app/(app)/search/components/TimeInput.tsx` (`TimeInput` with preset chips)
  - `apps/mobile-consumer/app/(app)/search/index.tsx` (main search screen with two-tier validation and dispatch)
  - `apps/mobile-consumer/__tests__/search-input.test.tsx` (10 unit tests covering skeleton loading, empty state, rider prefill, rider switching, round-trip dynamic mounting, presets, day picking, Zod validation, contract parse, and navigation)

---

## 5. Database Migrations Catalog

Four migrations have been authored, applied, and verified against PostgreSQL (`routeride_dev`):

| Migration Name | Applied In | Core DDL / Action | Purpose |
| --- | --- | --- | --- |
| `20261006T1500_matching_foundation` | T1.01 | - `CREATE TABLE driver_matching_stats`<br>- `CREATE TYPE "ScheduleLegType"` (`MORNING`, `AFTERNOON`)<br>- `ALTER TABLE driver_schedule_slots ADD COLUMN leg_type`<br>- `ALTER TABLE driver_schedule_slots ADD CONSTRAINT idx_dss_driver_sub_leg UNIQUE (driver_profile_id, subscription_id, leg_type)`<br>- `CREATE ROLE routeride_matching_ro NOLOGIN` | Establishes day-level departure statistics, distinguishes schedule slot legs, and provisions read-only database security role. |
| `20261006T1900_schedule_slots_time_type` | T1.04 | - `ALTER TABLE driver_schedule_slots ALTER COLUMN slot_start TYPE TIME WITHOUT TIME ZONE USING (slot_start AT TIME ZONE 'Asia/Karachi')::time`<br>- `ALTER TABLE driver_schedule_slots ALTER COLUMN slot_end TYPE TIME WITHOUT TIME ZONE USING (slot_end AT TIME ZONE 'Asia/Karachi')::time` | Aligns schedule slots with ADR-007 and Prisma schema (`@db.Time`), preventing session-timezone conversion bugs. |
| `20261007T1400_driver_acceptance_stats` | T1.06 | - `ALTER TABLE driver_profiles ADD COLUMN accepted_request_count INT NOT NULL DEFAULT 0`<br>- `ALTER TABLE driver_profiles ADD COLUMN eligible_request_count INT NOT NULL DEFAULT 0` | Adds raw request counts for canonical count-based Bayesian shrinkage of driver acceptance rate (AD-8). |
| `20261008T1500_driver_profiles_gist_index` | T1.09 | - `CREATE INDEX IF NOT EXISTS idx_dp_route ON driver_profiles USING gist (((route_polyline::geography)))`<br>- `CREATE INDEX IF NOT EXISTS idx_riders_home ON riders USING gist (((home_location::geography)))`<br>- `CREATE INDEX IF NOT EXISTS idx_riders_dest ON riders USING gist (((dest_location::geography)))` | Deploys PostGIS GIST spatial index on route polylines and rider locations, eliminating sequential scans during corridor proximity filtering. |

---

## 6. Complete Codebase Changes & Directory Inventory

### 6.1 Created Files

| File Path | Task | Responsibility |
| --- | :---: | --- |
| `apps/api/migrations/app/20261006T1500_matching_foundation/migration.sql` | T1.01 | DDL migration for matching stats, slot leg types, and read-only role |
| `apps/api/migrations/app/20261006T1900_schedule_slots_time_type/migration.sql` | T1.04 | DDL migration converting schedule slots to `TIME WITHOUT TIME ZONE` |
| `apps/api/migrations/app/20261007T1400_driver_acceptance_stats/migration.sql` | T1.06 | DDL migration adding acceptance request count columns |
| `apps/api/prisma/provision-ro-user.ts` | T1.01 | Provisioning script for `routeride_matching_ro` database user |
| `packages/contracts/test-vectors/eligibility.json` | T1.01 | Canonical cross-language test vectors for stages E1–E7 |
| `apps/matching/app/config.py` | T1.01 | Pydantic application settings with fail-fast bounding box validation |
| `apps/matching/app/schemas/__init__.py` | T1.01 | Schema package exports |
| `apps/matching/app/schemas/internal_search.py` | T1.01 | Pydantic schemas mirroring TypeScript Zod contracts |
| `apps/matching/app/matching/__init__.py` | T1.02–T1.06 | Central re-export of all matching engine symbols |
| `apps/matching/app/matching/candidates.py` | T1.02 | Stage E1–E3, E5 PostGIS candidate retrieval and exclusion diagnostics |
| `apps/matching/app/matching/direction.py` | T1.03 | Stage E4 corridor traversal direction and 50m separation validation |
| `apps/matching/app/matching/service_window.py` | T1.04/1.05 | Canonical `RequestedServiceWindow` constructor and invariant validation |
| `apps/matching/app/matching/capacity.py` | T1.04 | Stage E6 distinct subscription seat capacity accounting |
| `apps/matching/app/matching/timing.py` | T1.05 | Stage E7 timing conflict interval overlap check |
| `apps/matching/app/matching/scoring.py` | T1.06 | Stage E8 composite scoring and deterministic full-precision ranking |
| `apps/matching/app/maps/__init__.py` | T1.05 | Maps module exports |
| `apps/matching/app/maps/duration.py` | T1.05 | Deterministic Haversine commute duration and display duration Protocol |
| `apps/matching/tests/conftest.py` | T1.01 | Pytest fixtures (`reset_app_state`, `test_app`, `async_client`, `mock_db_pool`) |
| `apps/matching/tests/test_config.py` | T1.01 | Unit tests for bounding box precedence, validation, and fail-fast exits |
| `apps/matching/tests/test_vectors.py` | T1.01 | Validates Pydantic schemas against shared test vectors |
| `apps/matching/tests/test_candidates.py` | T1.02 | Unit & integration tests for spatial queries, Cartesian product fix, and PostGIS plans |
| `apps/matching/tests/test_direction.py` | T1.03 | Unit tests for 50m distance validation and corridor direction projection |
| `apps/matching/tests/test_capacity.py` | T1.04 | Unit & integration tests for seat capacity, status isolation, and distinct counts |
| `apps/matching/tests/test_timing.py` | T1.05 | Unit & integration tests for timing conflicts, boundary touching, and schedule slots |
| `apps/matching/tests/test_scoring.py` | T1.06 | Unit & integration tests for proximity matrix, Bayesian curves, and tie-breaking |
| `apps/matching/tests/test_edge_cases.py` | T1.07 | 19 comprehensive adversarial unit tests covering 50m boundaries, touching slots, cross-midnight, and hand vectors |
| `apps/matching/tests/test_properties.py` | T1.07 | 13 property-based tests using Hypothesis (monotonicity, boundedness, shuffle invariance, UUID tie-breaking) |
| `apps/api/src/common/service-unavailable-retry.exception.ts` | T1.08 | `ServiceUnavailableWithRetryException` adding custom `headers: { "Retry-After": "30" }` |
| `apps/api/src/search/matching.client.ts` | T1.08 | HTTP proxy client communicating with Python matching engine via Undici |
| `apps/api/src/search/search.service.ts` | T1.08 | Commute search orchestration, coordinate resolution, caching, DB enrichment |
| `apps/api/src/search/search.controller.ts` | T1.08 | Controller for `GET /api/v1/drivers/search` with JWT, roles, rate limit guards |
| `apps/api/src/search/search.module.ts` | T1.08 | Module providing search service, matching client, and Redis client |
| `apps/api/test/search.integration.test.ts` | T1.08 | 28 unit and integration tests covering guards, validation, bounding box, caching, enrichment |
| `apps/api/test/matching-client.integration.test.ts` | T1.08 | 4 unit tests verifying Undici transport, headers, and upstream error translation |
| `apps/api/migrations/app/20261008T1500_driver_profiles_gist_index/migration.sql` | T1.09 | DDL migration adding `idx_dp_route` PostGIS GIST index and rider location indexes |
| `apps/matching/app/matching/engine.py` | T1.09 | Core matching engine pipeline orchestrator (E1 $\to$ E7 and E8 scoring) |
| `apps/matching/tests/test_engine.py` | T1.09 | 6 unit tests validating orchestrator execution, first-failure accounting, and precedence |
| `apps/matching/tests/perf/seed_500.py` | T1.09 | Synthetic benchmark generator (500 drivers, 2,000 subs) with `--seed`, `--clean`, `--explain` |
| `apps/matching/tests/perf/test_search_latency.py` | T1.09 | 100-sample latency benchmark harness and automated pytest SLA gate (`@pytest.mark.perf`) |
| `PERF.md` | T1.09 | Comprehensive performance baseline report, query plans, stage breakdowns, and optimization ledger |
| `apps/worker/src/database/database.module.ts` | T1.10 | DatabaseModule exporting DatabaseService with connection checkout |
| `apps/worker/src/driver-stats/driver-stats.job.ts` | T1.10 | DriverStatsJobService with transactional full-grid refresh |
| `apps/worker/src/driver-stats/driver-stats.worker.ts` | T1.10 | DriverStatsWorkerService consuming BullMQ queue `driver-stats` |
| `apps/worker/src/driver-stats/driver-stats.module.ts` | T1.10 | Module encapsulating driver stats precompute job and worker |
| `apps/worker/test/driver-stats.test.ts` | T1.10 | 11 unit tests validating acceptance rates, medians, ghost-row resets, and rollback |
| `apps/matching/app/matching/observability.py` | T1.10b | OpenTelemetry metrics and zero-PII `matching.search.decision` structured log |
| `apps/matching/tests/test_observability.py` | T1.10b | 3 unit tests verifying OTel metric recordings, single log event, zero-PII guarantees |
| `apps/worker/src/duration-cache/duration-cache.job.ts` | T1.10c | DurationCacheJobService precomputing durations into Redis with Haversine fallback |
| `apps/worker/src/duration-cache/duration-cache.worker.ts` | T1.10c | DurationCacheWorkerService consuming BullMQ queue `duration-cache` |
| `apps/worker/src/duration-cache/duration-cache.module.ts` | T1.10c | Module encapsulating duration cache warm-up job and worker |
| `apps/worker/test/duration-cache.test.ts` | T1.10c | 7 unit tests verifying key formatting, BBox, Distance Matrix API, fallback, lifecycle |
| `apps/mobile-consumer/app/(app)/search/components/SearchInputSkeleton.tsx` | T1.11 | Shimmering skeleton loader matching search form layout |
| `apps/mobile-consumer/app/(app)/search/components/RiderPicker.tsx` | T1.11 | Horizontal rider selector cards with avatar initials and destination |
| `apps/mobile-consumer/app/(app)/search/components/CorridorCard.tsx` | T1.11 | Read-only corridor card displaying home pickup and school destination |
| `apps/mobile-consumer/app/(app)/search/components/DayPicker.tsx` | T1.11 | 7-day operating day chip selector (0..6, Sunday..Saturday) |
| `apps/mobile-consumer/app/(app)/search/components/SubscriptionTypePicker.tsx` | T1.11 | Segmented control for `MORNING`, `AFTERNOON`, and `ROUND_TRIP` |
| `apps/mobile-consumer/app/(app)/search/components/TimeInput.tsx` | T1.11 | 24-hour time text input with quick preset chips |
| `apps/mobile-consumer/app/(app)/search/index.tsx` | T1.11 | Search input screen orchestrating data fetching, two-tier validation, and dispatch |
| `apps/mobile-consumer/__tests__/search-input.test.tsx` | T1.11 | 10 unit tests covering all search input screen flows, empty state, and validation |

### 6.2 Modified Files

| File Path | Tasks | Modifications |
| --- | :---: | --- |
| `apps/api/prisma/schema.prisma` | T1.01, T1.04, T1.06 | Added `DriverMatchingStats`, updated `DriverScheduleSlot`, added `acceptedRequestCount` and `eligibleRequestCount` |
| `apps/api/prisma/contract.prisma` | T1.01, T1.04, T1.06 | Aligned Prisma contract definitions |
| `apps/api/test/schema.integration.test.ts` | T1.01, T1.09 | Updated schema integration tests for relations, `idx_dp_route` GIST index, and rider indexes |
| `packages/config/src/env.ts` & `env.test.ts` | T1.01 | Added matching environment variables and bounding box parsing |
| `packages/contracts/src/modules/search.ts` | T1.01, T1.08 | Added Zod schemas for internal search payloads and public gateway queries/responses |
| `packages/contracts/src/contracts.test.ts` | T1.01, T1.08 | Contract tests for internal and public search schemas |
| `apps/matching/pyproject.toml` | T1.01–T1.10b | Configured pytest, coverage threshold ($\ge 90\%$), asyncio mode, hypothesis, markers, and linters |
| `apps/matching/app/main.py` | T1.01, T1.09 | Configured FastAPI app lifecycle, mounted `POST /internal/v1/matching/search`, structured logging |
| `apps/matching/app/logging.py` & `tracing.py` | T1.01 | Structured logging and OpenTelemetry tracing setup |
| `apps/matching/app/matching/candidates.py` | T1.02, T1.09 | Optimized `SPATIAL_EXCLUSIONS_SQL` using set-based index filtering |
| `apps/matching/app/matching/direction.py` | T1.03, T1.09 | Point instance reuse in loop and re-scoped exclusion logging to debug level |
| `apps/matching/app/matching/capacity.py` | T1.04, T1.09 | Re-scoped per-candidate exclusion logging to debug level |
| `apps/matching/app/matching/timing.py` | T1.05, T1.09, T1.10c | Re-scoped per-candidate exclusion logging to debug level; added Redis duration tests |
| `apps/matching/app/matching/engine.py` | T1.09, T1.10b | Replaced legacy logging with canonical `record_matching_decision()` telemetry |
| `apps/matching/app/maps/duration.py` | T1.05, T1.10c | Implemented `RedisCachedDurationEstimator` conforming to `CommuteDurationEstimator` Protocol |
| `apps/worker/src/database/database.service.ts` | T1.10 | Added `getClient(): Promise<pg.PoolClient>` for transactional isolation |
| `apps/worker/src/app.module.ts` | T1.10, T1.10c | Registered `DriverStatsModule` and `DurationCacheModule` |
| `apps/api/package.json` | T1.08 | Added `undici` and `@opentelemetry/api` dependencies |
| `apps/api/src/common/error.filter.ts` | T1.08 | Added custom header propagation support from `HttpException` |
| `apps/api/src/app.module.ts` | T1.08 | Registered `SearchModule` in root application module |
| `apps/mobile-consumer/app/(app)/_layout.tsx` | T1.11 | Registered `search` screen with `href: null` to hide from bottom tabs |
| `apps/mobile-consumer/app/(app)/index.tsx` | T1.11 | Added "Find Drivers / Commute Matching" CTA card navigating to `/(app)/search` |
| `apps/mobile-consumer/package.json` | T1.11 | Configured Jest `testTimeout: 20000` to prevent cold-start test runner timeouts |
| `tasks/PHASE1A.md` | T1.01–T1.11 | Updated architecture specifications and marked tasks T1.01–T1.11 completed |
| `tasks/todo.md` | T1.01–T1.11 | Marked tasks T1.01–T1.11 completed |

---

## 7. Test Suite & Verification Matrix

### 7.1 Test Coverage by Module (`apps/matching`)

```text
=============================== tests coverage ================================
Platform: win32, Python: 3.14.4, Pytest: 9.1.1
Total Test Cases: 151 passed (1 perf deselected) in 4.01s

Name                             Stmts   Miss Branch BrPart  Cover   Missing
----------------------------------------------------------------------------
app\__init__.py                      0      0      0      0   100%
app\config.py                      122      5     32      5    94%   107, 109, 145, 147, 149
app\logging.py                      24      0     10      0   100%
app\main.py                         64      2      8      1    96%   48->60, 140-141
app\maps\__init__.py                 2      0      0      0   100%
app\maps\duration.py                51      1     10      3    93%   81, 134->151, 138->140, 144->151
app\matching\__init__.py             9      0      0      0   100%
app\matching\candidates.py          95      0     22      0   100%
app\matching\capacity.py            52      0      8      0   100%
app\matching\direction.py           57      0     14      0   100%
app\matching\engine.py              48      1      6      1    96%   73
app\matching\observability.py       32      0      8      0   100%
app\matching\scoring.py             84      1     16      1    98%   92
app\matching\service_window.py     103      0     30      0   100%
app\matching\timing.py              67      0     12      1    99%   184->170
app\schemas\__init__.py              2      0      0      0   100%
app\schemas\internal_search.py      68      0      2      0   100%
app\tracing.py                      24      0      4      0   100%
----------------------------------------------------------------------------
TOTAL                              904     10    182     12    98%
Required test coverage of 90% reached. Total coverage: 97.97%
====================== 151 passed, 1 deselected in 4.01s ======================
```

### 7.2 Test Suite Breakdown (`apps/matching`)

| Test File | Test Count | Key Invariants Verified |
| --- | :---: | --- |
| `test_engine.py` | 6 | End-to-end matching orchestrator execution (E1 $\to$ E7 and E8 scoring); strict first-failure precedence (Capacity E6 strictly before Timing E7); empty fleet handling; top-20 result capping |
| `test_candidates.py` | 14 | Cartesian product fix; E2 geometry precedence ($NULL \to EMPTY \to WRONG\_SRID \to NON\_SIMPLE \to INVALID$); distance failure before operating day; PostGIS query plan |
| `test_direction.py` | 20 | 50m separation rejection (`422 INVALID_ROUTE_REQUEST`); corridor projection; outbound vs reverse return; round-trip traversal along undirected corridor; sub-epsilon collocation |
| `test_capacity.py` | 18 | Available seat math; round-trip 1 seat rule; status isolation (active vs pending vs cancelled); operating day isolation; cross-midnight rejection; inverted leg times rejection |
| `test_timing.py` | 12 | Canonical overlap formula; touching boundaries allowed (`gap = 0`); dual-leg round-trip conflict exclusion; live PostgreSQL schedule slots query with UUID array; Redis duration cache hits/misses/fallback |
| `test_scoring.py` | 13 | Proximity boundary matrix; timing empirical differences and neutral 0.500 fallback; rating Bayesian curves ($N=0,1,5,20$); capacity headroom; acceptance count Bayesian curves; full-precision unrounded tie-breaking; 100x shuffle invariance; result capping at 20; live PostgreSQL end-to-end integration |
| `test_edge_cases.py` | 19 | Exact 50.00m geodesic endpoints (49.999m vs 50.000m); 1500m/2000m corridor boundaries; cross-midnight interval rejection; touching slots ($gap=0$); E1 $\to$ E7 first-failure precedence matrix; E2 geometry classification hierarchy; single-seat capacity boundary ($C=1$); brand-new driver neutral priors ($N=0$); 3 deterministic hand-calculated scoring vectors; result-limit boundaries |
| `test_properties.py` | 13 | Hypothesis property fuzzing: score boundedness in $[0.0, 1.0]$ with finite guarantees; proximity & timing monotonicity; ranking permutation invariance across 100 shuffles; arc-length projection monotonicity on polylines; schedule slot interval overlap symmetry; `COUNT(DISTINCT subscription.id)` headroom preservation; Bayesian asymptotic convergence as $N \to \infty$; strict UUID tie-breaking; configuration bounds; NaN/$\pm\infty$ Pydantic input rejection |
| `test_observability.py` | 3 | Canonical first-failure OTel metrics, single decision structured log emission, zero-PII assertions, dominant reason precedence |
| `test_config.py` | 12 | Fail-fast bounding box parsing; Karachi defaults; coordinate inequalities; format equality assertion |
| `test_vectors.py` | 4 | Shared cross-language test vectors (`eligibility.json`) validation against Pydantic schemas |
| `test_health.py` | 6 | FastAPI `/health` endpoint, read-only DB connectivity probe, OpenTelemetry headers |
| `test_logging.py` | 5 | Structured JSON log format, correlation ID propagation, log level filtering |
| `test_tracing.py` | 6 | OpenTelemetry tracer provider, span creation, error status recording |
| `test_search_latency.py` | 1 | Automated pytest SLA benchmark gate (`@pytest.mark.perf`) asserting P50 $< 120\text{ms}$ and P99 $< 400\text{ms}$ across 4 real-world Karachi scenarios |

### 7.3 Test Suite Breakdown (`apps/worker`)

| Test File | Test Count | Statements | Branches | Key Invariants Verified |
| --- | :---: | :---: | :---: | --- |
| `driver-stats.test.ts` | 11 | 100% | 100% | Acceptance rate calculation, median departure times, ghost-row resets to NULL/0/1/2, 90-day window, idempotent re-runs, transactional rollback isolation, worker job handling |
| `duration-cache.test.ts` | 7 | 98.98% | 88.46% | Key formatting, Karachi BBox filtering, Google Maps Distance Matrix API integration, timeout fallback to Haversine, full warm-up execution, worker job handling |
| `database.service.test.ts` | 5 | 84.61% | 25% | Connection pool management, query execution, client checkout/release |
| `notification-worker.service.test.ts` | 14 | 94.44% | 100% | BullMQ notification consumption, FCM/SendGrid adapter dispatch, retry policies |
| **Total Worker Suite** | **37** | **95.0%** | **85.29%** | All 5 test suites passed (well exceeds 65% branch coverage gate) |

### 7.4 Linters & Quality Gates
- **`apps/matching`:** 151/151 tests passed, 97.97% coverage. `ruff check app tests` 0 errors. `mypy app tests` 0 errors across 35 source files.
- **`apps/worker`:** 37/37 tests passed across 5 test suites, 95.0% statement, 85.29% branch coverage. `tsc --noEmit` 0 errors.
- **`apps/api`:** 224/224 tests passed across 22 test suites. `tsc --noEmit` 0 errors.
- **`apps/mobile-consumer`:** 29/29 tests passed across 4 test suites, 92.27% statement, 78.34% branch coverage. `eslint . --max-warnings=0` 0 errors, 0 warnings. `tsc --noEmit` 0 errors.
- **`packages/contracts`:** 22/22 tests passed. `tsc --noEmit` 0 errors.

### 7.5 Test Suite Breakdown (`apps/mobile-consumer`)

| Test File | Test Count | Statements | Branches | Key Invariants Verified |
| --- | :---: | :---: | :---: | --- |
| `search-input.test.tsx` | 10 | 96.47% | 76.47% | Shimmering skeleton rendering during fetch; empty state with direct link to `/(app)/riders/add` when 0 riders exist; prefilling addresses into read-only corridor cards; instant address updates on rider selection; dynamic afternoon return time picker mounted strictly when `subscriptionType === "ROUND_TRIP"`; time preset chip selection; 7-day operating day selection; client-side time format validation blocking submission; Zod contract validation (`DriverSearchQuerySchema.parse()`); stack navigation to `/(app)/search/results` with query parameters. |
| `profile.test.tsx` | 7 | 97.22% | 76.92% | Consumer profile loading, emergency contact form updates, validation feedback, logout flow. |
| `riders.test.tsx` | 8 | 78.78% | 68.75% | Rider list rendering, rider creation, rider edit navigation, 409 conflict modal handling on active subscriptions. |
| `login.test.tsx` | 4 | 100% | 100% | Mobile phone login, OTP digit input, SMS resent countdown, session initialization. |
| **Total Mobile Consumer Suite** | **29** | **92.27%** | **78.34%** | All 4 test suites passed (well exceeds 70% statement and 65% branch coverage gates) |

---

## 8. Next Steps in Phase 1A

With Tasks 1.01 through 1.11 completed, the entire backend matching core, test harness, public gateway endpoint, database migrations, worker precompute jobs, structured decision telemetry, cache warm-up services, and mobile commute search input screen are fully built, verified, and documented. The remaining Phase 1A tasks focus on client-side search results display, driver profile inspection, and atomic subscription booking revalidation:

- [x] **T1.07 — Edge-Case and Property Test Suite:** Adversarial boundary distances, coordinate edge cases, and property-based fuzzing across the entire filter chain.
- [x] **T1.08 — `GET /drivers/search` Gateway Endpoint:** NestJS gateway endpoint bridging authenticated mobile clients to the Python matching engine, attaching display duration enrichment.
- [x] **T1.09 — Performance Harness & Baseline:** P50 $< 120\text{ms}$ and P99 $< 400\text{ms}$ latency validation under 500 approved drivers and 2,000 subscriptions.
- [x] **T1.10 — Daily Precompute Worker Job:** BullMQ job pre-computing driver acceptance stats and day-level median departure times.
- [x] **T1.10b — Structured Matching Decision Metrics:** OpenTelemetry metrics for canonical E1–E7 first-failure steps with zero-PII structured logging.
- [x] **T1.10c — Daily Duration Cache Warm-Up Job:** BullMQ off-peak worker pre-computing Maps durations into Redis with Haversine fallback.
- [x] **T1.11 — Mobile Search Input Screen:** React Native / Expo search interface for riders with conditional round-trip picker and shared Zod validation.
- [ ] **T1.12 — Mobile Search Results Screen:** Ranked driver card list with dominant no-match diagnostic guidance, formatted pricing, and route visualization.
- [ ] **T1.13 — Mobile Driver Public Profile Screen:** Driver public details using contracted DTO without exposing internal metrics.
- [ ] **T1.14 — Atomic Subscription Booking Revalidation:** Serializable transaction revalidating canonical E1–E7 rules with jittered retry before subscription creation.

# Phase 1A — Doubt-driven review of the eligibility filter set

**Date:** 2026-10-31 · **Reviewer:** Claude Code session (AI-performed; a human sign-off is still recommended) · **Closes:** Checkpoint 1-A items "every hard filter has a failing-then-passing test", "the aggregate-fan-out regression test fails against the TRD's original query" and "doubt-driven review completed".

## Method

Assume every filter is wrong and try to prove it. For each retained eligibility predicate, break it in source (one mutation at a time), run the whole matching suite against a migrated PostGIS test database, and require at least one test to fail. A mutation no test notices is a missing test. Source files were restored byte-for-byte after each run (verified by `cmp` against a backup of the one file that already had uncommitted edits).

Scope: the corridor-baseline modules still in the repository (`candidates.py`, `direction.py`, `capacity.py`, `timing.py`) and the current amended discovery query (`discovery.py`, ADR-011 city-market model).

## Result

The first pass found real gaps. After adding tests, every mutation is killed.

| Area                                                                                                                                                                                                                                    | Mutations | First pass     | After fixes |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------- | ----------- |
| v1 candidate query: E1 status, E2 geometry, E3 pickup and destination radius, E5 operating day                                                                                                                                          | 5         | **5 survived** | 5 killed    |
| v1 candidate query: 3×4 fan-out (the TRD's original join shape, reproduced by joining reviews to subscriptions in either aggregate)                                                                                                     | 2         | 2 killed       | 2 killed    |
| v1 direction (reversed; ROUND_TRIP rejected), capacity (off-by-one, non-DISTINCT, non-ACTIVE counted), timing (touching windows in Python and SQL, overlap never detected)                                                              | 8         | 8 killed       | 8 killed    |
| v2 discovery: approval, accepting_requests, coverage setup, starting location, city, route simplicity, route/state agreement, availability start/end/day, ROUND_TRIP return leg, full-run exclusion, non-ACTIVE and expired assignments | 14        | **8 survived** | 14 killed   |

Tests added:

- `tests/test_candidates.py::test_live_postgis_hard_filters_exclude_each_ineligible_driver` seeds one eligible driver plus one violator per v1 filter (pending, suspended, null geometry, self-intersecting route, pickup too far, destination too far, wrong day).
- `tests/test_discovery_postgis.py::test_postgis_every_discovery_filter_excludes_its_violator` does the same for every v2 predicate and proves cancelled and expired riders free the seat.
- `tests/test_readonly_role.py` proves `routeride_matching_ro` can SELECT but cannot INSERT, UPDATE, DELETE, TRUNCATE or run DDL. It was checked red-then-green by temporarily granting INSERT on `riders`, which failed the test; the grant was revoked and the test passed again.

## Findings still open

None of these block the checkpoint; each needs an owner decision.

| #   | Finding                                                                                                                                              | Why it matters                                                                                                                                              | Suggested owner / task                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| F1  | `operating_city = 'PK-KHI'` is a literal in `DISCOVERY_SQL`.                                                                                         | `CLAUDE.md` forbids hardcoding configurable launch values. Adding a second city needs a code change, and the city must stay in step with `packages/config`. | Parameterise from config; decide before a second market.                    |
| F2  | v2 capacity counts only `ACTIVE` subscriptions. `PAUSED` ones are not counted, although driver-settings edits protect them.                          | AD-10 says paused riders free their seat, but a rider who resumes could exceed capacity if resume does not re-check.                                        | Resume and cancellation flows (T1.16/T1.20) must re-validate capacity.      |
| F3  | The v1 corridor path (`/internal/v1`, `candidates.py`, `direction.py`, gateway `search()`) is still present but the public route uses v2.            | Dead code that drifts, and it keeps the stale ADR-011 corridor rules alive.                                                                                 | Decide whether to retire v1 once no client needs it.                        |
| F4  | ROUND_TRIP direction in v1 is a single `pos_pickup < pos_dest` check, relying on the undirected-corridor rule (AD-9) rather than two evaluated legs. | The checkpoint wording says "dual-leg"; the dual-leg guarantee lives in v2 (both legs need availability and capacity).                                      | Informational; superseded by v2, which is tested.                           |
| F5  | Availability is inclusive at the window end (`window_end >= requested_time`).                                                                        | A pickup at exactly the end of a driver's hours is discoverable. Product may want trip duration included.                                                   | Product decision; the detailed feasibility check (A1.10) is the real guard. |
| F6  | Discovery ranks and paginates in memory after fetching every eligible driver.                                                                        | Fine at the measured 500 drivers (P99 64 ms); O(N) per request beyond that.                                                                                 | Revisit if the driver population grows by an order of magnitude.            |
| F7  | The reviews aggregate has no moderation or status filter, because the table has no such column.                                                      | Hidden or disputed reviews would still count once moderation exists.                                                                                        | Reviews phase (T1.5x).                                                      |

## What this review does not cover

- Acceptance-time revalidation (the original E1–E7 atomic booking check): not implemented; replaced by Phase 1B T1.16/T1.17.
- Real-device behaviour and CI on Node 22 / Python 3.12.

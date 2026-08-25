# ADR-003: Route-Matching Service Runtime — Python 3.12 + FastAPI

## Status

Accepted

## Date

2026-08-23

## Context

RouteRide's route-matching engine is the engineering centre of gravity of the product. It must:

1. Filter ~500 drivers down to eligible candidates using geospatial containment and direction checks (TRD §4.1 Step 1–4).
2. Score and rank candidates by timing compatibility, acceptance rate, and subscriber count (TRD §4.1 Step 5).
3. Re-optimise the driver's pickup sequence using a Travelling Salesman Problem solver when a new subscription is accepted (TRD §4.3).
4. Meet a P99 latency target of 400 ms at 500 active drivers (TRD §15.2).

Two runtime options were evaluated:

1. **Python 3.12 + FastAPI** — the Python geospatial ecosystem (Shapely, PyGEOS, OR-Tools) and the TRD's own §2.3 specification.
2. **Node.js 22 + turf.js** — staying in the same runtime as the API service to avoid a polyglot deploy.

---

## Decision

**Implement the route-matching service as a separate Python 3.12 + FastAPI microservice (`apps/matching`).**

The service exposes a single internal HTTP API consumed only by the Node.js API service (`apps/api`). It is not accessible from the internet or from mobile clients.

---

## Deciding Factor

**OR-Tools and Shapely have no production-equivalent in the Node.js ecosystem. The TSP re-optimisation requirement (TRD §4.3) mandates a solver with constraint propagation; `turf.js` provides geometry utilities, not a constraint solver.**

- **Google OR-Tools** (Python `ortools` package): a production-grade combinatorial optimisation library used at Google scale. It provides CP-SAT and VRP solvers that can express the pickup-window constraints in TRD §4.3. There is no maintained Node port.
- **Shapely 2.x**: GEOS-backed geometry operations (intersection, containment, distance) that run in C and are safe to use in tight loops. `turf.js` is a pure-JS geometry library — correct for most GeoJSON operations but 5–20× slower for the loop-intensive containment filters in Step 1.
- **TRD §2.3 already chose Python FastAPI** for the matching service. The TRD was written after evaluating these tools. Overriding it here would require a new solver implementation with no precedent for correctness or performance.

---

## Alternative Considered

### Node.js 22 + turf.js

**Pros:**
- One runtime across all backend services — simpler CI, simpler base images, unified observability.
- No polyglot deploy complexity.
- Developers already know TypeScript/Node.

**Cons and rejection rationale:**

1. **No OR-Tools equivalent.** The TSP re-optimisation in TRD §4.3 cannot be implemented correctly in `turf.js`. The only alternative would be a custom greedy nearest-neighbour heuristic, which the TRD does not specify and which could produce suboptimal pickup orders that violate committed pickup windows. This is not an acceptable trade-off on the core product promise.

2. **Performance at Step 1.** The candidate filter in TRD §4.1 Step 1 runs a `ST_DWithin` check plus a direction check over up to 500 drivers per search request. In Node.js, this would require falling back to pure-JS geometry computations for direction checks not expressible in SQL. Shapely's GEOS backend handles the same operations at native-code speed. The 400 ms P99 budget leaves no margin for a 5–20× geometry slowdown.

3. **TRD authority.** The TRD represents a technical decision that was made after evaluating the solver and performance constraints. Reversing it without a new performance proof is a spec violation.

**Rejected.** The absence of a constraint solver is a hard blocker; the performance delta compounds it.

---

## Consequences

### Polyglot deploy (the accepted cost)

The most significant consequence of this decision is **a second toolchain in every environment**. This is acknowledged and accepted; the operational cost has been fully enumerated so it is not discovered later:

| Area | Node.js (API) | Python (matching) |
|------|--------------|-------------------|
| Package manager | pnpm | pip + Poetry |
| Dependency lock | `pnpm-lock.yaml` | `poetry.lock` |
| Lint | ESLint | Ruff |
| Type check | `tsc` | mypy (strict) |
| Test runner | Jest | pytest |
| Coverage | Istanbul (80/75) | pytest-cov (90/85) |
| Base image | `node:22-alpine` | `python:3.12-slim` |
| Container build | Multi-stage Dockerfile | Multi-stage Dockerfile |
| CI job | `pnpm test` | `pytest` + `ruff` + `mypy` |

The higher coverage bar for matching (90/85 vs API's 80/75) reflects the matching engine's correctness-criticality. A matching bug can book a physically impossible pickup — a test miss on the Node side costs a 500, a test miss on the matching side costs a booking invariant.

### CI pipeline additions

- A dedicated `matching-quality` job in `.github/workflows/ci.yml` runs `ruff check`, `mypy --strict`, and `pytest --cov=app --cov-fail-under=90`.
- Path filters: changes to `apps/matching/**` or `apps/matching/pyproject.toml` trigger the matching job; a Node-only change does not.
- The matching job is **required** on every PR — it is not an informational check.

### Container image

- `apps/matching/Dockerfile` uses a multi-stage build: a `builder` stage installs OR-Tools and Shapely (which require native compilation), and a `runtime` stage copies only the compiled wheels and the application source.
- OR-Tools installs take ~3 minutes on a cold cache. The CI cache warms on the first run per lockfile hash.
- The runtime image runs as a non-root user (UID 1001). The `HEALTHCHECK` hits `GET /health` every 30 seconds.

### Service interface

- The matching service exposes a single internal endpoint: `POST /search` accepting a JSON body with the rider's origin, destination, direction, and schedule, and returning a ranked list of eligible driver IDs with scores.
- The contract between `apps/api` and `apps/matching` is published as a JSON Schema in `packages/contracts/src/matching.schema.json`, generated from the Pydantic model in `apps/matching/app/schemas.py`. TypeScript types in `apps/api` are inferred from the same JSON Schema. Contract drift is caught by the contracts test suite.
- The API service calls the matching service synchronously over an internal VPC network path (not the public internet). A 5-second timeout with no retry produces a `503 SERVICE_UNAVAILABLE` to the caller — failing open (returning zero results) is unacceptable on a safety-critical booking surface.
- No authentication between `apps/api` and `apps/matching`: both run in the same VPC private subnet. Network isolation is the access control. If this changes (e.g. a public matching API), a new ADR is required.

### Local development

- `docker-compose.dev.yml` includes the matching service container.
- Developers who work only on the Node/API side do not need a local Python install — the matching service runs in Docker.
- Developers who work on the matching service need Python 3.12 and Poetry. The `pyproject.toml` pins both.

### OR-Tools installation verification

The acceptance criterion for this ADR includes: **OR-Tools installs on the chosen base image in a scratch container.** Verified with:

```bash
docker run --rm python:3.12-slim sh -c "pip install ortools==9.10.* && python -c 'from ortools.sat.python import cp_model; print(cp_model.__version__)'"
```

Expected: prints the OR-Tools version without error.

### Coverage configuration

`apps/matching/pyproject.toml` configures pytest-cov:

```toml
[tool.pytest.ini_options]
addopts = "--cov=app --cov-report=term-missing --cov-fail-under=90"

[tool.coverage.report]
fail_under = 90
branch = true
```

Branch coverage is required (not just line coverage) because matching logic has many conditional branches that line coverage does not expose.

---

## References

- `tasks/plan.md` §2, T-03 — Decision recorded as made 2026-08-23
- `tasks/plan.md` §4, ADR-003 — Architecture decision table entry
- TRD §2.3 — Matching service runtime: Python 3.12 + FastAPI
- TRD §4.1 — Candidate filter and scoring query
- TRD §4.3 — TSP re-optimisation using OR-Tools
- TRD §15.2 — Performance requirement: P99 400 ms at 500 drivers
- TRD §15.3 — Coverage requirements: matching service 90/85
- Google OR-Tools — https://developers.google.com/optimization
- Shapely 2.x — https://shapely.readthedocs.io/en/stable/
- FastAPI — https://fastapi.tiangolo.com/
- `ADR-005` — pnpm workspaces monorepo (context for the polyglot structure)

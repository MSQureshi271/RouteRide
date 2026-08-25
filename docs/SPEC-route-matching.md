# SPEC: route-matching

> **Module ID:** `route-matching`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`route-matching`)

---

## 1. Objective

Provide the algorithmic matching engine and search service (Python 3.12 / FastAPI / OR-Tools / Shapely) that evaluates candidate driver routes against parent commute requests. Enforce geometric proximity (ST_DWithin), direction alignment, schedule compatibility (+/- 15 mins), vehicle capacity constraints, and rank candidates using a multi-factor scoring function.

### User Personas
- **Consumer:** Searches for available drivers covering their child's home -> school commute.
- **Matching Service:** Polyglot microservice responding with scored, ranked match candidates in < 250ms p95.

---

## 2. Commands

```bash
# Matching service test suite
cd apps/matching
pytest
ruff check .
mypy app

# Run matching service in dev
uvicorn app.main:app --reload --port 8000
```

---

## 3. Project Structure

```
apps/matching/
├── pyproject.toml              # Python dependencies (FastAPI, OR-Tools, Shapely, Pydantic)
├── app/
│   ├── main.py                 # FastAPI application root & middleware
│   ├── config.py               # Pydantic settings
│   ├── routers/
│   │   ├── search.py           # POST /api/v1/matching/search endpoint
│   │   └── optimize.py         # POST /api/v1/matching/optimize-route (TSP)
│   ├── services/
│   │   ├── geometry.py         # Shapely spatial distance & direction calculation
│   │   ├── solver.py           # OR-Tools constraint optimization
│   │   └── scorer.py           # Multi-factor score calculator (detour, rating, price)
│   └── models/                 # Pydantic request/response schemas
└── tests/
    ├── test_health.py          # Liveness & readiness probes
    ├── test_geometry.py        # Spatial indexing tests
    ├── test_matcher.py         # End-to-end matching algorithm tests
    └── test_perf.py            # Latency benchmark harness
```

---

## 4. Code Style & Rules

- **Typing:** Strict Python typing on all functions (`mypy app` passes with zero errors).
- **FastAPI / Pydantic:** Pydantic v2 schemas for all request/response models with field constraints.
- **Logging:** Structlog with JSON output; latitude and longitude rounded to 2 decimal places.
- **Performance:** Matching search response time must remain < 250ms for 100 candidate routes.

---

## 5. Testing Strategy

- **Unit Tests:** Geometry calculations (perpendicular distance to polyline), direction vector dot product, scoring weight formulas.
- **Property-based Tests:** Randomized pickup/dropoff points along synthetic polylines ensuring matches always respect maximum detour limits.
- **Performance Harness:** Benchmark script measuring solver execution time under 10, 50, and 200 concurrent driver candidate loads.

---

## 6. Boundaries & Non-Goals

### In Scope
- Spatial corridor matching (pickup within 500m of route, dropoff within 500m of destination).
- Directionality check (pickup point index along route occurs before dropoff point index).
- Schedule overlap check and seat capacity availability.
- Multi-factor scoring (Composite: 40% detour time, 30% driver rating, 20% price, 10% experience).

### Non-Goals (Out of Scope)
- Dynamic on-demand ride hailing routing (RouteRide is strictly recurring fixed-schedule).
- Live real-time traffic recalculation during active trips.

---

## 7. Success Criteria

1. Matching query returns valid ranked matches in < 250ms.
2. Drivers travelling in the reverse direction are rejected with score = 0.
3. Drivers with zero available seats on the requested shift are excluded from results.
4. Pytest test suite achieves >= 90% line coverage and >= 85% branch coverage.

---

## 8. Open Questions & Known Gaps

- *Resolved in ADR-003:* Python FastAPI + OR-Tools service selected as polyglot microservice alongside NestJS API.

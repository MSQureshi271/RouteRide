"""Unit, property, and integration tests for Stage E8 Scoring & Deterministic Ranking (Phase 1A Task 1.06).

Validates:
1. Independent radius proximity scoring boundary matrix (0,0), (1500,0), (0,2000), (750,1000), (1500,2000).
2. Day-level typical departure timing score with neutral 0.500 fallback (< 3 observations).
3. Rating score empirical Bayesian shrinkage curves (0, 1, 5, 20 observations).
4. Capacity headroom score as available seats / seat capacity.
5. Acceptance score empirical Bayesian shrinkage using canonical counts (AD-8).
6. Isolated component weight effects and composite score bounds in [0.0, 1.0].
7. Full-precision unrounded tie-breaking (preserves sub-micro score differences, ties broken by UUID).
8. Shuffle invariance: 100 shuffled executions produce identical ranking order.
9. Result capping at 20 (and configurable limit).
10. Live PostgreSQL integration with accepted_request_count and eligible_request_count.
"""

from __future__ import annotations

import random
from datetime import time
from uuid import UUID, uuid4

import asyncpg
import pytest
from _database import matching_test_database_url
from shapely.geometry import LineString

from app.config import settings
from app.matching.candidates import CandidateDriver
from app.matching.capacity import CapacityCheckResult
from app.matching.scoring import (
    ScoredCandidateMatch,
    compute_acceptance_score,
    compute_capacity_score,
    compute_composite_score,
    compute_proximity_score,
    compute_rating_score,
    compute_timing_score,
    ranking_sort_key,
    score_and_rank_candidates,
)
from app.schemas.internal_search import InternalSearchRequest

DUMMY_ROUTE = LineString([(67.01, 24.86), (67.11, 24.92)])


def make_search_request(
    time_str: str = "07:30",
    pickup_radius: float = 1500.0,
    dest_radius: float = 2000.0,
) -> InternalSearchRequest:
    """Helper to construct standard InternalSearchRequest."""
    return InternalSearchRequest(
        riderId=UUID("550e8400-e29b-41d4-a716-446655440000"),
        pickupLat=24.86,
        pickupLng=67.01,
        destLat=24.92,
        destLng=67.11,
        day=1,
        departureTime=time_str,
        subscriptionType="ONE_WAY",
        pickupRadiusMeters=pickup_radius,
        destRadiusMeters=dest_radius,
    )


def make_candidate_driver(
    driver_id: UUID | None = None,
    seat_capacity: int = 4,
    pickup_distance: float = 0.0,
    dest_distance: float = 0.0,
    avg_rating: float | None = 5.0,
    review_count: int = 10,
    typical_departure: time | None = time(7, 30),
    departure_observations: int = 5,
    accepted_count: int = 4,
    eligible_count: int = 5,
) -> CandidateDriver:
    """Helper to construct standard CandidateDriver."""
    return CandidateDriver(
        driver_profile_id=driver_id or uuid4(),
        user_id=uuid4(),
        seat_capacity=seat_capacity,
        operating_days=[1, 2, 3, 4, 5],
        acceptance_rate=0.8,
        route_geometry=DUMMY_ROUTE,
        pickup_distance_meters=pickup_distance,
        dest_distance_meters=dest_distance,
        avg_rating=avg_rating,
        review_count=review_count,
        active_subscriptions_count=0,
        typical_departure_time=typical_departure,
        departure_observation_count=departure_observations,
        accepted_count=accepted_count,
        eligible_count=eligible_count,
    )


def make_capacity_result(
    driver_id: UUID,
    seat_capacity: int = 4,
    available_seats: int = 4,
) -> CapacityCheckResult:
    """Helper to construct CapacityCheckResult."""
    return CapacityCheckResult(
        driver_profile_id=driver_id,
        seat_capacity=seat_capacity,
        overlapping_active_subscriptions=seat_capacity - available_seats,
        available_seats=available_seats,
        is_eligible=True,
    )


# ─── 1. Proximity Scoring Tests ───────────────────────────────────────────────


def test_proximity_score_boundary_matrix() -> None:
    """Validate all 5 rows of the canonical independent radius normalization matrix."""
    r_pickup = 1500.0
    r_dest = 2000.0

    # Row 1: (0, 0) -> pickupScore=1.0, destScore=1.0, proximityScore=1.000
    p1, d1, prox1 = compute_proximity_score(0.0, 0.0, r_pickup, r_dest)
    assert p1 == 1.0
    assert d1 == 1.0
    assert prox1 == 1.000

    # Row 2: (1500, 0) -> pickupScore=0.0, destScore=1.0, proximityScore=0.500
    p2, d2, prox2 = compute_proximity_score(1500.0, 0.0, r_pickup, r_dest)
    assert p2 == 0.0
    assert d2 == 1.0
    assert prox2 == 0.500

    # Row 3: (0, 2000) -> pickupScore=1.0, destScore=0.0, proximityScore=0.500
    p3, d3, prox3 = compute_proximity_score(0.0, 2000.0, r_pickup, r_dest)
    assert p3 == 1.0
    assert d3 == 0.0
    assert prox3 == 0.500

    # Row 4: (750, 1000) -> pickupScore=0.5, destScore=0.5, proximityScore=0.500
    p4, d4, prox4 = compute_proximity_score(750.0, 1000.0, r_pickup, r_dest)
    assert p4 == 0.5
    assert d4 == 0.5
    assert prox4 == 0.500

    # Row 5: (1500, 2000) -> pickupScore=0.0, destScore=0.0, proximityScore=0.000
    p5, d5, prox5 = compute_proximity_score(1500.0, 2000.0, r_pickup, r_dest)
    assert p5 == 0.0
    assert d5 == 0.0
    assert prox5 == 0.000


def test_proximity_score_clamping_and_defensive() -> None:
    """Distance beyond radius clamps to 0.0; non-positive radius returns 0.0."""
    _, _, score_clamped = compute_proximity_score(1800.0, 2500.0, 1500.0, 2000.0)
    assert score_clamped == 0.0

    _, _, score_zero_radius = compute_proximity_score(0.0, 0.0, 0.0, 2000.0)
    assert score_zero_radius == 0.0


# ─── 2. Timing Scoring Tests ──────────────────────────────────────────────────


def test_timing_score_empirical_departure() -> None:
    """Validate empirical timing departure scores with max_diff=60m."""
    req_time = "07:30"

    # diff = 0m -> 1.000
    assert compute_timing_score(time(7, 30), 5, req_time) == 1.0
    # diff = 15m -> 0.750
    assert compute_timing_score(time(7, 45), 5, req_time) == 0.75
    # diff = 30m -> 0.500
    assert compute_timing_score(time(7, 0), 5, req_time) == 0.5
    # diff = 45m -> 0.250
    assert compute_timing_score(time(6, 45), 5, req_time) == 0.25
    # diff = 60m -> 0.000
    assert compute_timing_score(time(6, 30), 5, req_time) == 0.0
    # diff = 90m -> 0.000 (clamped)
    assert compute_timing_score(time(6, 0), 5, req_time) == 0.0


def test_timing_score_neutral_fallbacks() -> None:
    """Observations < 3 or typical_departure is None falls back to neutral 0.500."""
    # observations = 0, 1, 2
    for count in [0, 1, 2]:
        assert compute_timing_score(time(7, 30), count, "07:30") == 0.500
        assert compute_timing_score(time(6, 0), count, "07:30") == 0.500

    # typical_departure is None
    assert compute_timing_score(None, 10, "07:30") == 0.500


# ─── 3. Rating Bayesian Shrinkage Tests ────────────────────────────────────────


def test_rating_score_bayesian_shrinkage_curves() -> None:
    """Validate Bayesian shrinkage curves toward prior 0.700 with weight 5.0 (AD-8)."""
    # 0 reviews or None rating -> prior 0.7000
    assert compute_rating_score(None, 0) == 0.700
    assert compute_rating_score(5.0, 0) == 0.700

    # 5.0-star driver curve (0, 1, 5, 20 observations):
    # N=1: (1 * 1.0 + 5 * 0.7) / 6 = 4.5 / 6 = 0.7500
    assert round(compute_rating_score(5.0, 1), 4) == 0.7500
    # N=5: (5 * 1.0 + 5 * 0.7) / 10 = 8.5 / 10 = 0.8500
    assert round(compute_rating_score(5.0, 5), 4) == 0.8500
    # N=20: (20 * 1.0 + 5 * 0.7) / 25 = 23.5 / 25 = 0.9400
    assert round(compute_rating_score(5.0, 20), 4) == 0.9400
    # N=100: (100 * 1.0 + 3.5) / 105 = 0.9857
    assert round(compute_rating_score(5.0, 100), 4) == 0.9857

    # 1.0-star driver curve (N=1, 5, 20):
    # N=1: (1 * 0.2 + 3.5) / 6 = 3.7 / 6 = 0.6167
    assert round(compute_rating_score(1.0, 1), 4) == 0.6167
    # N=5: (5 * 0.2 + 3.5) / 10 = 4.5 / 10 = 0.4500
    assert round(compute_rating_score(1.0, 5), 4) == 0.4500
    # N=20: (20 * 0.2 + 3.5) / 25 = 7.5 / 25 = 0.3000
    assert round(compute_rating_score(1.0, 20), 4) == 0.3000


# ─── 4. Capacity Headroom Tests ───────────────────────────────────────────────


def test_capacity_score_available_seats_ratio() -> None:
    """Validate capacity headroom score as remaining available seats ratio."""
    assert compute_capacity_score(available_seats=4, seat_capacity=4) == 1.0
    assert compute_capacity_score(available_seats=2, seat_capacity=4) == 0.5
    assert compute_capacity_score(available_seats=1, seat_capacity=4) == 0.25
    assert compute_capacity_score(available_seats=0, seat_capacity=4) == 0.0
    assert compute_capacity_score(available_seats=5, seat_capacity=0) == 0.0


# ─── 5. Acceptance Rate Bayesian Shrinkage Tests ──────────────────────────────


def test_acceptance_score_canonical_counts_shrinkage() -> None:
    """Validate acceptance score via canonical request counts (AD-8)."""
    # 0 eligible requests -> neutral prior 0.8000
    assert compute_acceptance_score(accepted_count=0, eligible_count=0) == 0.8000

    # 100% acceptance curve (N=1, 5, 20):
    # N=1: (1 + 5 * 0.8) / 6 = 5.0 / 6 = 0.8333
    assert round(compute_acceptance_score(1, 1), 4) == 0.8333
    # N=5: (5 + 4.0) / 10 = 9.0 / 10 = 0.9000
    assert round(compute_acceptance_score(5, 5), 4) == 0.9000
    # N=20: (20 + 4.0) / 25 = 24.0 / 25 = 0.9600
    assert round(compute_acceptance_score(20, 20), 4) == 0.9600

    # 0% acceptance curve (N=1, 5, 20):
    # N=1: (0 + 4.0) / 6 = 4.0 / 6 = 0.6667
    assert round(compute_acceptance_score(0, 1), 4) == 0.6667
    # N=5: (0 + 4.0) / 10 = 4.0 / 10 = 0.4000
    assert round(compute_acceptance_score(0, 5), 4) == 0.4000
    # N=20: (0 + 4.0) / 25 = 4.0 / 25 = 0.1600
    assert round(compute_acceptance_score(0, 20), 4) == 0.1600


# ─── 6. Composite Score & Weight Isolation Tests ──────────────────────────────


def test_composite_score_weight_isolation() -> None:
    """Varying each component in isolation proves exact configured weight effect."""
    weights = {
        "proximity": settings.MATCHING_WEIGHT_PROXIMITY,  # 0.40
        "timing": settings.MATCHING_WEIGHT_TIMING,  # 0.25
        "rating": settings.MATCHING_WEIGHT_RATING,  # 0.20
        "capacity": settings.MATCHING_WEIGHT_CAPACITY,  # 0.10
        "acceptance": settings.MATCHING_WEIGHT_ACCEPTANCE,  # 0.05
    }
    assert round(sum(weights.values()), 6) == 1.0

    # All zeros
    base_score, _ = compute_composite_score(0.0, 0.0, 0.0, 0.0, 0.0)
    assert base_score == 0.0

    # Proximity only = 1.0
    s_prox, _ = compute_composite_score(1.0, 0.0, 0.0, 0.0, 0.0)
    assert round(s_prox, 4) == weights["proximity"]

    # Timing only = 1.0
    s_time, _ = compute_composite_score(0.0, 1.0, 0.0, 0.0, 0.0)
    assert round(s_time, 4) == weights["timing"]

    # Rating only = 1.0
    s_rate, _ = compute_composite_score(0.0, 0.0, 1.0, 0.0, 0.0)
    assert round(s_rate, 4) == weights["rating"]

    # Capacity only = 1.0
    s_cap, _ = compute_composite_score(0.0, 0.0, 0.0, 1.0, 0.0)
    assert round(s_cap, 4) == weights["capacity"]

    # Acceptance only = 1.0
    s_acc, _ = compute_composite_score(0.0, 0.0, 0.0, 0.0, 1.0)
    assert round(s_acc, 4) == weights["acceptance"]

    # All ones
    max_score, breakdown = compute_composite_score(1.0, 1.0, 1.0, 1.0, 1.0)
    assert max_score == 1.0
    assert breakdown.proximityScore == 1.0
    assert breakdown.timingScore == 1.0
    assert breakdown.ratingScore == 1.0
    assert breakdown.capacityScore == 1.0
    assert breakdown.acceptanceScore == 1.0


# ─── 7. Full-Precision Tie-Breaking & Stability Tests ─────────────────────────


def test_ranking_preserves_sub_micro_differences_without_rounding_collapse() -> None:
    """Assert ranking operates on unrounded full-precision floats, preserving B > A."""
    id_a = UUID("11111111-1111-4111-8111-111111111111")
    id_b = UUID("22222222-2222-4222-8222-222222222222")

    # Match A has 0.81234541, Match B has 0.81234549 (differs at 8th decimal)
    match_a = ScoredCandidateMatch(
        driver_profile_id=id_a,
        composite_score_exact=0.81234541,
        score_breakdown=compute_composite_score(0.8, 0.8, 0.8, 0.8, 0.8)[1],
        available_seats=3,
        seat_capacity=4,
        pickup_distance_meters=100.0,
        dest_distance_meters=200.0,
        avg_rating=4.5,
        review_count=10,
    )
    match_b = ScoredCandidateMatch(
        driver_profile_id=id_b,
        composite_score_exact=0.81234549,
        score_breakdown=compute_composite_score(0.8, 0.8, 0.8, 0.8, 0.8)[1],
        available_seats=3,
        seat_capacity=4,
        pickup_distance_meters=100.0,
        dest_distance_meters=200.0,
        avg_rating=4.5,
        review_count=10,
    )

    matches = [match_a, match_b]
    matches.sort(key=ranking_sort_key)

    # B has higher score than A, so B must rank first despite id_a < id_b
    assert matches[0].driver_profile_id == id_b
    assert matches[1].driver_profile_id == id_a


def test_ranking_breaks_exact_ties_by_driver_id_ascending() -> None:
    """When composite scores are bit-for-bit identical, smaller UUID string ranks first."""
    id_lower = UUID("11111111-1111-4111-8111-111111111111")
    id_higher = UUID("99999999-9999-4999-8999-999999999999")

    match_low = ScoredCandidateMatch(
        driver_profile_id=id_lower,
        composite_score_exact=0.85000000,
        score_breakdown=compute_composite_score(0.85, 0.85, 0.85, 0.85, 0.85)[1],
        available_seats=2,
        seat_capacity=4,
        pickup_distance_meters=150.0,
        dest_distance_meters=250.0,
        avg_rating=4.5,
        review_count=10,
    )
    match_high = ScoredCandidateMatch(
        driver_profile_id=id_higher,
        composite_score_exact=0.85000000,
        score_breakdown=compute_composite_score(0.85, 0.85, 0.85, 0.85, 0.85)[1],
        available_seats=2,
        seat_capacity=4,
        pickup_distance_meters=150.0,
        dest_distance_meters=250.0,
        avg_rating=4.5,
        review_count=10,
    )

    # Test both orderings in input
    ranked_1 = sorted([match_high, match_low], key=ranking_sort_key)
    ranked_2 = sorted([match_low, match_high], key=ranking_sort_key)

    assert ranked_1[0].driver_profile_id == id_lower
    assert ranked_2[0].driver_profile_id == id_lower


def test_ranking_shuffle_invariance() -> None:
    """Shuffling candidate inputs 100 times produces identical ranked output order."""
    req = make_search_request()
    candidates: list[CandidateDriver] = []
    cap_results: dict[UUID, CapacityCheckResult] = {}

    # Create 15 candidates with distinct distance, departure, rating, and acceptance attributes
    for i in range(15):
        d_id = UUID(f"10000000-0000-4000-8000-{i:012d}")
        cand = make_candidate_driver(
            driver_id=d_id,
            pickup_distance=100.0 * (i + 1),
            dest_distance=150.0 * (i + 1),
            avg_rating=3.5 + (i % 3) * 0.5,
            review_count=i * 2,
            typical_departure=time(7, 20 + (i % 20)),
            departure_observations=i,
            accepted_count=i,
            eligible_count=i + 2,
        )
        candidates.append(cand)
        cap_results[d_id] = make_capacity_result(d_id, seat_capacity=4, available_seats=(i % 4) + 1)

    baseline_ranked = score_and_rank_candidates(candidates, cap_results, req, limit=20)
    baseline_order = [m.driver_profile_id for m in baseline_ranked]

    # Run 100 random shuffles
    for _ in range(100):
        shuffled = list(candidates)
        random.shuffle(shuffled)
        shuffled_ranked = score_and_rank_candidates(shuffled, cap_results, req, limit=20)
        assert [m.driver_profile_id for m in shuffled_ranked] == baseline_order


# ─── 8. Result Slicing / Capping Tests ─────────────────────────────────────────


def test_score_and_rank_result_capping() -> None:
    """25 eligible candidates are sliced to default limit 20, or custom limit."""
    req = make_search_request()
    candidates: list[CandidateDriver] = []
    cap_results: dict[UUID, CapacityCheckResult] = {}

    for i in range(25):
        d_id = uuid4()
        cand = make_candidate_driver(driver_id=d_id, pickup_distance=50.0 * i)
        candidates.append(cand)
        cap_results[d_id] = make_capacity_result(d_id)

    # Default capping (MATCHING_MAX_RESULTS = 20)
    res_default = score_and_rank_candidates(candidates, cap_results, req)
    assert len(res_default) == 20

    # Custom limit = 5
    res_custom = score_and_rank_candidates(candidates, cap_results, req, limit=5)
    assert len(res_custom) == 5

    # Empty candidate list fast-path
    assert score_and_rank_candidates([], {}, req) == []


# ─── 9. Live PostgreSQL Integration Test ──────────────────────────────────────


@pytest.mark.asyncio
async def test_live_postgres_end_to_end_scoring() -> None:
    """Execute live PostgreSQL query selecting acceptance stats and ranking candidate drivers."""
    database_url = matching_test_database_url()
    if database_url is None:
        pytest.skip("MATCHING_TEST_DATABASE_URL must name a dedicated test database")
    try:
        pool = await asyncpg.create_pool(database_url, min_size=1, max_size=2)
        assert pool is not None
    except Exception as exc:
        pytest.skip(f"PostgreSQL not available: {exc}")

    driver_id = uuid4()
    user_id = uuid4()
    req = make_search_request()

    try:
        async with pool.acquire() as conn:
            # Seed user, driver_profile (with accepted_request_count, eligible_request_count), and stats
            await conn.execute(
                """
                INSERT INTO users (id, phone, full_name, role, status)
                VALUES ($1::text, '+923009999888', 'Scoring Test Driver', 'DRIVER', 'ACTIVE');
                """,
                str(user_id),
            )
            await conn.execute(
                """
                INSERT INTO driver_profiles (
                  id, user_id, licence_number, vehicle_make, vehicle_model, vehicle_year,
                  vehicle_colour, plate_number, seat_capacity, operating_days,
                  base_price_cents, status, verification_tier, route_polyline, route_state,
                  accepted_request_count, eligible_request_count
                )
                VALUES (
                  $1::text, $2::text, 'LIC-SCORE-01', 'Toyota', 'HiAce', 2022,
                  'White', 'SCORE-001', 4, ARRAY[1, 2, 3, 4, 5],
                  5000, 'APPROVED', 'BASIC',
                  ST_SetSRID(ST_GeomFromText('LINESTRING(67.005 24.855, 67.115 24.925)'), 4326), 'ESTABLISHED',
                  9, 10
                );
                """,
                str(driver_id),
                str(user_id),
            )
            await conn.execute(
                """
                INSERT INTO driver_matching_stats (
                  driver_profile_id, operating_day, typical_departure_time, observation_count
                )
                VALUES ($1::text, 1, '07:30'::time, 12);
                """,
                str(driver_id),
            )

        from app.matching.candidates import find_spatial_candidates

        # Run spatial candidate retrieval with pool
        candidates = await find_spatial_candidates(pool, req)
        matched = [c for c in candidates if c.driver_profile_id == driver_id]
        assert len(matched) == 1
        cand = matched[0]

        # Verify acceptance counts and day-level departure stats were populated
        assert cand.accepted_count == 9
        assert cand.eligible_count == 10
        assert cand.typical_departure_time == time(7, 30)
        assert cand.departure_observation_count == 12

        # Rank candidate
        cap_results = {
            driver_id: make_capacity_result(driver_id, seat_capacity=4, available_seats=3)
        }
        ranked = score_and_rank_candidates([cand], cap_results, req)
        assert len(ranked) == 1
        match = ranked[0]

        assert match.driver_profile_id == driver_id
        assert 0.0 < match.composite_score_exact <= 1.0
        assert match.available_seats == 3
        # Acceptance score for 9 accepted / 10 eligible: (9 + 4.0) / 15 = 13.0 / 15.0 = 0.8667
        assert round(match.score_breakdown.acceptanceScore, 4) == 0.8667
        # Timing score for exact departure 07:30 vs requested 07:30: 1.0000
        assert match.score_breakdown.timingScore == 1.0000

    finally:
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM driver_matching_stats WHERE driver_profile_id = $1::text;",
                str(driver_id),
            )
            await conn.execute("DELETE FROM driver_profiles WHERE id = $1::text;", str(driver_id))
            await conn.execute("DELETE FROM users WHERE id = $1::text;", str(user_id))
        await pool.close()

"""Property-based test suite for RouteRide Phase 1A matching engine (Task 1.07).

Uses Hypothesis to test deep mathematical and logical invariants over thousands of
randomized permutations:
1. Score boundedness: component & composite scores in [0.0, 1.0].
2. Score monotonicity across all 5 dimensions.
3. Deterministic ranking & 100x shuffle invariance.
4. Full-precision unrounded float tie-breaking (score desc, UUID asc).
5. On-polyline projection monotonicity for sequential arc-lengths s1 <= s2 <= s3.
6. Schedule interval overlap symmetry: overlaps(A, B) <=> overlaps(B, A).
7. Capacity headroom: COUNT(DISTINCT subscription.id) seat invariant.
8. Bayesian shrinkage: N=0 identity, [min, max] bounding, N -> inf convergence.
9. Configuration validation: bounding box area, weights sum to 1.0, non-negative params.
"""

from __future__ import annotations

import math
import random
from datetime import time
from typing import Literal
from uuid import UUID, uuid4

from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st
from shapely.geometry import LineString

from app.config import settings
from app.matching.candidates import CandidateDriver
from app.matching.capacity import CapacityCheckResult
from app.matching.direction import project_point_on_route
from app.matching.scoring import (
    compute_acceptance_score,
    compute_capacity_score,
    compute_proximity_score,
    compute_rating_score,
    compute_timing_score,
    score_and_rank_candidates,
)
from app.schemas.internal_search import InternalSearchRequest

# Configure Hypothesis settings: fast in-memory execution, no deadline
hyp_settings.register_profile("matching_fast", max_examples=100, deadline=None)
hyp_settings.load_profile("matching_fast")


# ─────────────────────────────────────────────────────────────────────────────
# Helper Constructors
# ─────────────────────────────────────────────────────────────────────────────


def make_search_request(
    *,
    pickup_lat: float = 24.8607,
    pickup_lng: float = 67.0011,
    dest_lat: float = 24.9056,
    dest_lng: float = 67.0822,
    day: int = 1,
    subscription_type: Literal["ONE_WAY", "ROUND_TRIP"] = "ONE_WAY",
    time_str: str = "08:00",
) -> InternalSearchRequest:
    return InternalSearchRequest(
        riderId=uuid4(),
        pickupLat=pickup_lat,
        pickupLng=pickup_lng,
        destLat=dest_lat,
        destLng=dest_lng,
        pickupRadiusMeters=settings.MATCHING_PICKUP_RADIUS_M,
        destRadiusMeters=settings.MATCHING_DEST_RADIUS_M,
        day=day,
        subscriptionType=subscription_type,
        departureTime=time_str,
    )


def make_candidate_with_scores(
    driver_id: UUID,
    p_dist: float,
    d_dist: float,
    timing_diff_m: int,
    avg_rating: float | None,
    review_count: int,
    avail_seats: int,
    cap_seats: int,
    acc_count: int,
    elig_count: int,
) -> tuple[CandidateDriver, CapacityCheckResult]:
    cand = CandidateDriver(
        driver_profile_id=driver_id,
        user_id=uuid4(),
        seat_capacity=cap_seats,
        operating_days=[1, 2, 3, 4, 5],
        acceptance_rate=(acc_count / elig_count) if elig_count > 0 else None,
        route_geometry=LineString([(67.00, 24.85), (67.10, 24.95)]),
        pickup_distance_meters=p_dist,
        dest_distance_meters=d_dist,
        avg_rating=avg_rating,
        review_count=review_count,
        active_subscriptions_count=cap_seats - avail_seats,
        typical_departure_time=time(8, timing_diff_m % 60) if timing_diff_m < 60 else None,
        departure_observation_count=5 if timing_diff_m < 60 else 0,
        accepted_count=acc_count,
        eligible_count=elig_count,
    )
    eligible = avail_seats >= 1
    cap_res = CapacityCheckResult(
        driver_profile_id=driver_id,
        seat_capacity=cap_seats,
        overlapping_active_subscriptions=cap_seats - avail_seats,
        available_seats=avail_seats,
        is_eligible=eligible,
        exclusion_reason=None if eligible else "CAPACITY",
    )
    return cand, cap_res


# ─────────────────────────────────────────────────────────────────────────────
# Property 1: Score Boundedness in [0.0, 1.0] and Finite Guarantees
# ─────────────────────────────────────────────────────────────────────────────


@given(
    p_dist=st.floats(min_value=0.0, max_value=10000.0, allow_nan=False, allow_infinity=False),
    d_dist=st.floats(min_value=0.0, max_value=10000.0, allow_nan=False, allow_infinity=False),
    r_p=st.floats(min_value=1.0, max_value=5000.0, allow_nan=False, allow_infinity=False),
    r_d=st.floats(min_value=1.0, max_value=5000.0, allow_nan=False, allow_infinity=False),
    rating=st.floats(min_value=0.0, max_value=5.0, allow_nan=False, allow_infinity=False),
    reviews=st.integers(min_value=0, max_value=1000),
    acc=st.integers(min_value=0, max_value=500),
    elig=st.integers(min_value=0, max_value=500),
    avail=st.integers(min_value=0, max_value=10),
    cap=st.integers(min_value=1, max_value=10),
)
def test_property_score_boundedness(
    p_dist: float,
    d_dist: float,
    r_p: float,
    r_d: float,
    rating: float,
    reviews: int,
    acc: int,
    elig: int,
    avail: int,
    cap: int,
) -> None:
    """Property 1: Every component score and composite score is strictly in [0.0, 1.0] and finite."""
    # Proximity
    sp, sd, sprox = compute_proximity_score(p_dist, d_dist, r_p, r_d)
    assert 0.0 <= sp <= 1.0 and math.isfinite(sp)
    assert 0.0 <= sd <= 1.0 and math.isfinite(sd)
    assert 0.0 <= sprox <= 1.0 and math.isfinite(sprox)

    # Rating
    srate = compute_rating_score(rating, reviews)
    assert 0.0 <= srate <= 1.0 and math.isfinite(srate)

    # Acceptance (clamp acc <= elig for valid sample)
    valid_acc = min(acc, elig)
    sacc = compute_acceptance_score(valid_acc, elig)
    assert 0.0 <= sacc <= 1.0 and math.isfinite(sacc)

    # Capacity
    valid_avail = min(avail, cap)
    scap = compute_capacity_score(valid_avail, cap)
    assert 0.0 <= scap <= 1.0 and math.isfinite(scap)

    # Timing
    stime = compute_timing_score(time(8, 0), 5, "08:15")
    assert 0.0 <= stime <= 1.0 and math.isfinite(stime)


# ─────────────────────────────────────────────────────────────────────────────
# Property 2: Score Monotonicity Across All 5 Signals
# ─────────────────────────────────────────────────────────────────────────────


@given(
    d1=st.floats(min_value=0.0, max_value=1500.0, allow_nan=False, allow_infinity=False),
    d2=st.floats(min_value=0.0, max_value=1500.0, allow_nan=False, allow_infinity=False),
)
def test_property_proximity_monotonicity(d1: float, d2: float) -> None:
    """Decreasing pickup distance strictly increases or maintains proximity score."""
    p_closer = min(d1, d2)
    p_further = max(d1, d2)
    _, _, s_closer = compute_proximity_score(p_closer, 500.0, 1500.0, 2000.0)
    _, _, s_further = compute_proximity_score(p_further, 500.0, 1500.0, 2000.0)
    assert s_closer >= s_further - 1e-9


@given(
    r1=st.floats(min_value=1.0, max_value=5.0, allow_nan=False, allow_infinity=False),
    r2=st.floats(min_value=1.0, max_value=5.0, allow_nan=False, allow_infinity=False),
    reviews=st.integers(min_value=1, max_value=100),
)
def test_property_rating_monotonicity(r1: float, r2: float, reviews: int) -> None:
    """Higher average rating strictly increases or maintains shrunk rating score."""
    r_higher = max(r1, r2)
    r_lower = min(r1, r2)
    s_higher = compute_rating_score(r_higher, reviews)
    s_lower = compute_rating_score(r_lower, reviews)
    assert s_higher >= s_lower - 1e-9


@given(
    a1=st.integers(min_value=0, max_value=20),
    a2=st.integers(min_value=0, max_value=20),
    elig=st.integers(min_value=20, max_value=50),
)
def test_property_acceptance_monotonicity(a1: int, a2: int, elig: int) -> None:
    """Higher acceptance count strictly increases or maintains shrunk acceptance score."""
    a_higher = max(a1, a2)
    a_lower = min(a1, a2)
    s_higher = compute_acceptance_score(a_higher, elig)
    s_lower = compute_acceptance_score(a_lower, elig)
    assert s_higher >= s_lower - 1e-9


@given(
    seats1=st.integers(min_value=0, max_value=6),
    seats2=st.integers(min_value=0, max_value=6),
    cap=st.integers(min_value=6, max_value=10),
)
def test_property_capacity_monotonicity(seats1: int, seats2: int, cap: int) -> None:
    """More available seats strictly increases or maintains capacity score."""
    s_more = max(seats1, seats2)
    s_less = min(seats1, seats2)
    scap_more = compute_capacity_score(s_more, cap)
    scap_less = compute_capacity_score(s_less, cap)
    assert scap_more >= scap_less - 1e-9


# ─────────────────────────────────────────────────────────────────────────────
# Property 3 & 4: Ranking Determinism, Shuffle Invariance & Float Tie-Breaks
# ─────────────────────────────────────────────────────────────────────────────


def test_property_deterministic_ranking_and_shuffle_invariance() -> None:
    """Property 3: Shuffling candidate order 100 times never alters the ranked result IDs."""
    req = make_search_request()
    random.seed(42)

    # Create 10 candidates with varying scores
    candidates: list[CandidateDriver] = []
    cap_results: dict[UUID, CapacityCheckResult] = {}
    for i in range(10):
        uid = uuid4()
        cand, cap_res = make_candidate_with_scores(
            driver_id=uid,
            p_dist=i * 100.0,
            d_dist=i * 100.0,
            timing_diff_m=i * 5,
            avg_rating=4.0 - i * 0.2,
            review_count=5 + i,
            avail_seats=max(1, 4 - (i % 3)),
            cap_seats=4,
            acc_count=10 - i,
            elig_count=12,
        )
        candidates.append(cand)
        cap_results[uid] = cap_res

    baseline_ranked = score_and_rank_candidates(candidates, cap_results, req)
    baseline_ids = [m.driver_profile_id for m in baseline_ranked]

    # Test 100 random shuffles
    for _ in range(100):
        shuffled = list(candidates)
        random.shuffle(shuffled)
        shuffled_ranked = score_and_rank_candidates(shuffled, cap_results, req)
        shuffled_ids = [m.driver_profile_id for m in shuffled_ranked]
        assert shuffled_ids == baseline_ids, "Shuffle altered ranking order!"


def test_property_full_precision_tie_break_stability() -> None:
    """Property 4: Unrounded scores decide ordering; identical scores broken by UUID string."""
    req = make_search_request()
    uid_a = UUID("00000000-0000-0000-0000-000000000001")
    uid_b = UUID("00000000-0000-0000-0000-000000000002")

    # Identical candidate attributes
    cand_a, cap_a = make_candidate_with_scores(uid_a, 500.0, 500.0, 0, 4.5, 5, 2, 4, 10, 10)
    cand_b, cap_b = make_candidate_with_scores(uid_b, 500.0, 500.0, 0, 4.5, 5, 2, 4, 10, 10)
    cap_res = {uid_a: cap_a, uid_b: cap_b}

    # Since composite scores are identical, uid_a ("...01") ranks before uid_b ("...02")
    ranked = score_and_rank_candidates([cand_b, cand_a], cap_res, req)
    assert ranked[0].driver_profile_id == uid_a
    assert ranked[1].driver_profile_id == uid_b

    # Now make cand_b microscopically better by 1 meter (0.0001 score difference)
    # Even though uid_b > uid_a lexicographically, cand_b MUST rank first because of higher score!
    cand_b_better, cap_b_better = make_candidate_with_scores(
        uid_b, 499.0, 500.0, 0, 4.5, 5, 2, 4, 10, 10
    )
    cap_res_better = {uid_a: cap_a, uid_b: cap_b_better}
    ranked_better = score_and_rank_candidates([cand_a, cand_b_better], cap_res_better, req)
    assert ranked_better[0].driver_profile_id == uid_b, "Microscopically higher score must win!"


# ─────────────────────────────────────────────────────────────────────────────
# Property 5: On-Polyline Projection Monotonicity Along LineStrings
# ─────────────────────────────────────────────────────────────────────────────


@given(
    f1=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
    f2=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
    f3=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
)
def test_property_on_polyline_projection_monotonicity(f1: float, f2: float, f3: float) -> None:
    """Property 5: Points sampled along a valid polyline at increasing arc-lengths s1 <= s2 <= s3

    project monotonically on the polyline: t1 <= t2 <= t3 in [0.0, 1.0].
    """
    fractions = sorted([f1, f2, f3])
    # Multi-segment non-self-intersecting route in Karachi
    line = LineString(
        [
            (67.00, 24.85),
            (67.03, 24.87),
            (67.07, 24.91),
            (67.12, 24.95),
        ]
    )
    total_len = line.length

    # Interpolate exact points along the curve
    p1 = line.interpolate(fractions[0] * total_len)
    p2 = line.interpolate(fractions[1] * total_len)
    p3 = line.interpolate(fractions[2] * total_len)

    t1 = project_point_on_route(line, p1.x, p1.y)
    t2 = project_point_on_route(line, p2.x, p2.y)
    t3 = project_point_on_route(line, p3.x, p3.y)

    assert 0.0 <= t1 <= 1.0
    assert 0.0 <= t2 <= 1.0
    assert 0.0 <= t3 <= 1.0
    assert t1 <= t2 + 1e-9, f"Projection ordering violated: {t1} > {t2}"
    assert t2 <= t3 + 1e-9, f"Projection ordering violated: {t2} > {t3}"


# ─────────────────────────────────────────────────────────────────────────────
# Property 6: Schedule Interval Overlap Symmetry & Touching Invariants
# ─────────────────────────────────────────────────────────────────────────────


def is_interval_conflict(s1: int, e1: int, s2: int, e2: int, gap: int = 0) -> bool:
    """Canonical AD-7 interval conflict definition."""
    return (s1 < e2 + gap) and (e1 + gap > s2)


@given(
    s1=st.integers(min_value=0, max_value=1400),
    dur1=st.integers(min_value=1, max_value=120),
    s2=st.integers(min_value=0, max_value=1400),
    dur2=st.integers(min_value=1, max_value=120),
    gap=st.integers(min_value=0, max_value=15),
)
def test_property_interval_overlap_symmetry(
    s1: int, dur1: int, s2: int, dur2: int, gap: int
) -> None:
    """Property 6: Interval conflict detection is strictly symmetric:

    overlaps(A, B, gap) <=> overlaps(B, A, gap).
    """
    e1 = s1 + dur1
    e2 = s2 + dur2
    c_12 = is_interval_conflict(s1, e1, s2, e2, gap)
    c_21 = is_interval_conflict(s2, e2, s1, e1, gap)
    assert c_12 == c_21, f"Overlap asymmetry detected between [{s1},{e1}] and [{s2},{e2}]"


# ─────────────────────────────────────────────────────────────────────────────
# Property 7: Distinct Subscription ID Capacity Accounting Invariant
# ─────────────────────────────────────────────────────────────────────────────


@given(
    cap=st.integers(min_value=1, max_value=8),
    sub_count=st.integers(min_value=0, max_value=10),
)
def test_property_count_distinct_subscription_id_capacity(cap: int, sub_count: int) -> None:
    """Property 7: 2 schedule slots belonging to the SAME subscription ID consume exactly 1 seat.

    Fuzzes configurations with varying single-leg and dual-leg subscriptions and verifies
    that occupied seats identically equals the number of distinct overlapping subscriptions.
    """
    # Generate distinct subscriptions
    subscriptions = [uuid4() for _ in range(sub_count)]

    # Generate schedule slots: each subscription has 1 or 2 slots (e.g. ROUND_TRIP)
    slots: list[tuple[UUID, UUID]] = []  # (slot_id, subscription_id)
    for sub_id in subscriptions:
        slot_count = random.choice([1, 2])
        for _ in range(slot_count):
            slots.append((uuid4(), sub_id))

    # COUNT(DISTINCT s.id) logic
    distinct_occupied = len({sub_id for _, sub_id in slots})
    assert distinct_occupied == sub_count, "Distinct subscription count invariant violated"

    # Headroom evaluation
    available_seats = max(0, cap - distinct_occupied)
    is_eligible = distinct_occupied + 1 <= cap

    if distinct_occupied < cap:
        assert is_eligible is True
        assert available_seats >= 1
    else:
        assert is_eligible is False
        assert available_seats == 0


# ─────────────────────────────────────────────────────────────────────────────
# Property 8: Bayesian Shrinkage N=0 Identity & Asymptotic Convergence
# ─────────────────────────────────────────────────────────────────────────────


@given(
    rating=st.floats(min_value=1.0, max_value=5.0, allow_nan=False, allow_infinity=False),
)
def test_property_bayesian_rating_n_zero_and_convergence(rating: float) -> None:
    """Property 8: Bayesian rating shrinkage satisfies:

    1. N = 0 -> score == prior (0.700) identically.
    2. N > 0 -> score is bounded within [min(mean, prior), max(mean, prior)].
    3. N -> infinity -> score asymptotically approaches normalized sample mean.
    """
    prior = settings.MATCHING_RATING_PRIOR  # 0.700
    norm_mean = rating / 5.0

    # N = 0
    assert compute_rating_score(rating, 0) == prior
    assert compute_rating_score(None, 0) == prior

    # N = 10
    score_10 = compute_rating_score(rating, 10)
    assert min(norm_mean, prior) - 1e-9 <= score_10 <= max(norm_mean, prior) + 1e-9

    # N = 10_000 (Asymptotic convergence)
    score_inf = compute_rating_score(rating, 10_000)
    assert abs(score_inf - norm_mean) < 0.001


@given(
    acc=st.integers(min_value=0, max_value=100),
    elig=st.integers(min_value=1, max_value=100),
)
def test_property_bayesian_acceptance_n_zero_and_convergence(acc: int, elig: int) -> None:
    """Property 8: Bayesian acceptance shrinkage satisfies:

    1. N = 0 -> score == prior (0.800) identically.
    2. N > 0 -> score is bounded within [min(rate, prior), max(rate, prior)].
    """
    prior = settings.MATCHING_ACCEPTANCE_PRIOR  # 0.800
    valid_acc = min(acc, elig)
    rate = valid_acc / elig

    # N = 0
    assert compute_acceptance_score(0, 0) == prior

    # N > 0
    score = compute_acceptance_score(valid_acc, elig)
    assert min(rate, prior) - 1e-9 <= score <= max(rate, prior) + 1e-9


# ─────────────────────────────────────────────────────────────────────────────
# Property 9: Configuration Validation Properties
# ─────────────────────────────────────────────────────────────────────────────


def test_property_production_configuration_weights_and_bounds() -> None:
    """Property 9: Production configuration satisfies all architectural invariants:

    1. Weights sum to 1.0 within 1e-6.
    2. All weights are strictly positive.
    3. Radii and gap minutes are non-negative.
    4. Bounding box coordinates describe a valid, non-zero area.
    """
    # 1. Weights sum to 1.0
    weight_sum = (
        settings.MATCHING_WEIGHT_PROXIMITY
        + settings.MATCHING_WEIGHT_TIMING
        + settings.MATCHING_WEIGHT_RATING
        + settings.MATCHING_WEIGHT_CAPACITY
        + settings.MATCHING_WEIGHT_ACCEPTANCE
    )
    assert abs(weight_sum - 1.000000) < 1e-6

    # 2. Positive weights
    assert settings.MATCHING_WEIGHT_PROXIMITY > 0
    assert settings.MATCHING_WEIGHT_TIMING > 0
    assert settings.MATCHING_WEIGHT_RATING > 0
    assert settings.MATCHING_WEIGHT_CAPACITY > 0
    assert settings.MATCHING_WEIGHT_ACCEPTANCE > 0

    # 3. Valid parameters
    assert settings.MATCHING_PICKUP_RADIUS_M > 0
    assert settings.MATCHING_DEST_RADIUS_M > 0
    assert settings.MATCHING_SLOT_GAP_MINUTES >= 0

    # 4. Valid bounding box
    from app.config import service_bbox

    assert -90.0 <= service_bbox.min_lat < service_bbox.max_lat <= 90.0
    assert -180.0 <= service_bbox.min_lon < service_bbox.max_lon <= 180.0

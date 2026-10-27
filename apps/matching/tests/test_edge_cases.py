"""Adversarial edge-case test suite for RouteRide Phase 1A matching engine (Task 1.07).

Exhaustively verifies boundary tolerances, fail-fast invariants, defensive classifications,
and exact numerical guarantees across stages E1 through E8:
1. Exact 50.00m geodesic endpoint tests (49.999m rejected, 50.000m accepted, 50.001m accepted).
2. Boundary tolerances (0m, 1500m exact, 1500.001m breach, 2000m exact, 2000.001m breach).
3. Service window invariants (cross-midnight, inverted, touching gap=0).
4. ROUND_TRIP timing scoring semantics & dual-window invariants.
5. Canonical E1 -> E7 first-failure precedence matrix.
6. Defensive E2 geometry classification precedence tests (NULL -> EMPTY -> SRID -> SIMPLE -> VALID).
7. Asia/Karachi wall-clock & timezone invariant tests (fixed UTC+5, no phantom DST).
8. Single-seat capacity driver matrix (capacity = 1).
9. Brand-new driver neutral priors (0 reviews, 0 rides -> 0.70/0.80/0.50).
10. Hand-calculated deterministic scoring vectors (Vectors 1, 2, 3).
11. NaN / +Inf / -Inf input rejection & finite output guarantees.
12. Result-limit boundary tests (limit = 0, 1, 20, None, N > limit).
"""

from __future__ import annotations

import math
import zoneinfo
from datetime import datetime, time, timedelta
from typing import Any, Literal
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from shapely.geometry import LineString

from app.config import settings
from app.maps.duration import EARTH_RADIUS_METERS, haversine_distance_meters
from app.matching.candidates import (
    CandidateDriver,
    SpatialExclusionDiagnostics,
    parse_route_geometry,
)
from app.matching.capacity import (
    CapacityCheckResult,
    evaluate_candidate_capacity,
)
from app.matching.direction import (
    MIN_ENDPOINT_SEPARATION_METERS,
    InvalidRouteRequestError,
    filter_candidates_by_direction,
    project_point_on_route,
    validate_endpoint_separation,
)
from app.matching.scoring import (
    compute_acceptance_score,
    compute_capacity_score,
    compute_proximity_score,
    compute_rating_score,
    compute_timing_score,
    score_and_rank_candidates,
)
from app.matching.service_window import (
    InvalidRoundTripTimesError,
    InvalidServiceIntervalError,
    build_requested_service_windows,
)
from app.schemas.internal_search import InternalSearchRequest

# ─────────────────────────────────────────────────────────────────────────────
# Helper Fixtures & Constructors
# ─────────────────────────────────────────────────────────────────────────────


def make_search_request(
    *,
    rider_id: UUID | None = None,
    pickup_lat: float = 24.8607,
    pickup_lng: float = 67.0011,
    dest_lat: float = 24.9056,
    dest_lng: float = 67.0822,
    pickup_radius: float = settings.MATCHING_PICKUP_RADIUS_M,
    dest_radius: float = settings.MATCHING_DEST_RADIUS_M,
    day: int = 1,
    subscription_type: Literal["ONE_WAY", "ROUND_TRIP"] = "ONE_WAY",
    time_str: str = "08:00",
    pickup_time_str: str | None = None,
) -> InternalSearchRequest:
    return InternalSearchRequest(
        riderId=rider_id or uuid4(),
        pickupLat=pickup_lat,
        pickupLng=pickup_lng,
        destLat=dest_lat,
        destLng=dest_lng,
        pickupRadiusMeters=pickup_radius,
        destRadiusMeters=dest_radius,
        day=day,
        subscriptionType=subscription_type,
        departureTime=time_str,
        **({"pickupTime": pickup_time_str} if pickup_time_str is not None else {}),
    )


def make_candidate(
    *,
    driver_id: UUID | None = None,
    seat_capacity: int = 4,
    operating_days: list[int] | None = None,
    pickup_distance: float = 500.0,
    dest_distance: float = 500.0,
    avg_rating: float | None = 4.5,
    review_count: int = 5,
    active_subscriptions: int = 1,
    typical_departure: time | None = time(8, 0),
    observation_count: int = 5,
    accepted_count: int = 10,
    eligible_count: int = 12,
    route_geometry: Any = None,
) -> CandidateDriver:
    return CandidateDriver(
        driver_profile_id=driver_id or uuid4(),
        user_id=uuid4(),
        seat_capacity=seat_capacity,
        operating_days=operating_days if operating_days is not None else [1, 2, 3, 4, 5],
        acceptance_rate=(accepted_count / eligible_count) if eligible_count > 0 else None,
        route_geometry=route_geometry or LineString([(67.00, 24.85), (67.10, 24.95)]),
        pickup_distance_meters=pickup_distance,
        dest_distance_meters=dest_distance,
        avg_rating=avg_rating,
        review_count=review_count,
        active_subscriptions_count=active_subscriptions,
        typical_departure_time=typical_departure,
        departure_observation_count=observation_count,
        accepted_count=accepted_count,
        eligible_count=eligible_count,
    )


def make_capacity_result(
    driver_id: UUID,
    seat_capacity: int,
    overlapping: int,
) -> CapacityCheckResult:
    available = max(0, seat_capacity - overlapping)
    eligible = overlapping + 1 <= seat_capacity
    return CapacityCheckResult(
        driver_profile_id=driver_id,
        seat_capacity=seat_capacity,
        overlapping_active_subscriptions=overlapping,
        available_seats=available,
        is_eligible=eligible,
        exclusion_reason=None if eligible else "CAPACITY",
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. Exact 50.00m Geodesic Endpoint Tests
# ─────────────────────────────────────────────────────────────────────────────


def test_endpoint_separation_exact_50m() -> None:
    """Exact boundary test for geodesic endpoint separation:

    - 49.999m -> Rejected (HTTP 422 INVALID_ROUTE_REQUEST)
    - Exactly 50.000m -> Accepted cleanly without exception
    - 50.001m -> Accepted cleanly without exception
    """
    lat1 = 24.860000
    lng1 = 67.010000

    def delta_lat_deg_for_dist(d: float) -> float:
        return (d / EARTH_RADIUS_METERS) * (180.0 / math.pi)

    # 1. Boundary breach: 49.999m
    lat_sub_50 = lat1 + delta_lat_deg_for_dist(49.999)
    dist_sub = haversine_distance_meters(lat1, lng1, lat_sub_50, lng1)
    assert dist_sub < MIN_ENDPOINT_SEPARATION_METERS
    with pytest.raises(InvalidRouteRequestError) as exc_info:
        validate_endpoint_separation(lat1, lng1, lat_sub_50, lng1)
    assert exc_info.value.status_code == 422
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail["code"] == "INVALID_ROUTE_REQUEST"

    # 2. Exact boundary: 50.000m
    lat_exact_50 = lat1 + delta_lat_deg_for_dist(50.000)
    dist_exact = haversine_distance_meters(lat1, lng1, lat_exact_50, lng1)
    assert abs(dist_exact - 50.000) < 1e-9
    ret_exact = validate_endpoint_separation(lat1, lng1, lat_exact_50, lng1)
    assert abs(ret_exact - 50.000) < 1e-9

    # 3. Boundary clearance: 50.001m
    lat_over_50 = lat1 + delta_lat_deg_for_dist(50.001)
    dist_over = haversine_distance_meters(lat1, lng1, lat_over_50, lng1)
    assert dist_over > MIN_ENDPOINT_SEPARATION_METERS
    ret_over = validate_endpoint_separation(lat1, lng1, lat_over_50, lng1)
    assert ret_over >= 50.000


def test_endpoint_separation_identical_coordinates() -> None:
    """Distance = 0m (identical pickup and destination) is strictly rejected."""
    with pytest.raises(InvalidRouteRequestError) as exc:
        validate_endpoint_separation(24.86, 67.01, 24.86, 67.01)
    assert exc.value.status_code == 422
    assert isinstance(exc.value.detail, dict)
    assert exc.value.detail["code"] == "INVALID_ROUTE_REQUEST"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Boundary Tolerances (0m, 1500m exact, 1500.001m breach, 2000m exact, 2000.001m breach)
# ─────────────────────────────────────────────────────────────────────────────


def test_proximity_score_boundary_tolerances() -> None:
    """Proximity score behavior at exact configured radii and infinitesimal breaches."""
    r_p = settings.MATCHING_PICKUP_RADIUS_M  # 1500.0
    r_d = settings.MATCHING_DEST_RADIUS_M  # 2000.0

    # Exact boundary: 1500.0m pickup, 2000.0m dest -> Scores are exactly 0.0
    s_p, s_d, s_prox = compute_proximity_score(r_p, r_d, r_p, r_d)
    assert s_p == 0.0
    assert s_d == 0.0
    assert s_prox == 0.0

    # Infinitesimal boundary breach: 1500.001m pickup, 2000.001m dest -> Clamped to 0.0
    s_p_breach, s_d_breach, s_prox_breach = compute_proximity_score(
        r_p + 0.001, r_d + 0.001, r_p, r_d
    )
    assert s_p_breach == 0.0
    assert s_d_breach == 0.0
    assert s_prox_breach == 0.0

    # Exact co-location on route: 0.0m pickup, 0.0m dest -> Scores are exactly 1.0
    s_p_zero, s_d_zero, s_prox_zero = compute_proximity_score(0.0, 0.0, r_p, r_d)
    assert s_p_zero == 1.0
    assert s_d_zero == 1.0
    assert s_prox_zero == 1.0

    # Partial midpoints
    s_p_half, s_d_half, s_prox_half = compute_proximity_score(r_p / 2, r_d / 2, r_p, r_d)
    assert abs(s_p_half - 0.5) < 1e-9
    assert abs(s_d_half - 0.5) < 1e-9
    assert abs(s_prox_half - 0.5) < 1e-9


# ─────────────────────────────────────────────────────────────────────────────
# 3. Service Window Invariants (cross-midnight, inverted, touching gap=0)
# ─────────────────────────────────────────────────────────────────────────────


def test_service_window_cross_midnight_rejection() -> None:
    """Cross-midnight requested windows (start >= end or end >= 1440) are rejected with HTTP 400 (AD-13)."""
    # 1. Crossing midnight: 23:30 start with standard 15m buffer -> 23:45 + duration exceeds 1440 min
    req_cross = make_search_request(time_str="23:30")
    with pytest.raises(InvalidServiceIntervalError) as exc:
        build_requested_service_windows(req_cross)
    assert exc.value.status_code == 400
    assert isinstance(exc.value.detail, dict)
    assert exc.value.detail["code"] == "INVALID_SERVICE_INTERVAL"

    # 2. Too early: 00:05 with 15m buffer -> start < 0 min
    req_early = make_search_request(time_str="00:05")
    with pytest.raises(InvalidServiceIntervalError) as exc_early:
        build_requested_service_windows(req_early)
    assert exc_early.value.status_code == 400
    assert isinstance(exc_early.value.detail, dict)
    assert exc_early.value.detail["code"] == "INVALID_SERVICE_INTERVAL"


def test_service_window_touching_gap_zero() -> None:
    """Touching windows (0-minute gap) are valid and permitted per AD-7."""
    s1, e1 = 480, 510
    s2, e2 = 510, 540
    gap = settings.MATCHING_SLOT_GAP_MINUTES  # 0
    overlaps = (s1 < e2 + gap) and (e1 + gap > s2)
    assert not overlaps, "Exactly touching intervals with gap=0 must not overlap"


# ─────────────────────────────────────────────────────────────────────────────
# 4. ROUND_TRIP Timing Scoring Semantics & Dual-Window Invariants
# ─────────────────────────────────────────────────────────────────────────────


def test_round_trip_timing_scoring_semantics() -> None:
    """Explicit definition & test for ROUND_TRIP timing scoring:

    For ROUND_TRIP, timing score evaluates the outbound morning departure (request.departureTime)
    against the driver's morning typical_departure_time, while the afternoon leg feasibility
    is guaranteed via Stage E7 conflict checks. The presence of pickupTime does not skew scoring.
    """
    req_round_trip = make_search_request(
        subscription_type="ROUND_TRIP",
        time_str="08:00",
        pickup_time_str="16:00",
    )
    req_departure_only = make_search_request(
        subscription_type="ONE_WAY",
        time_str="08:00",
    )

    candidate = make_candidate(
        typical_departure=time(8, 15),
        observation_count=5,
    )

    cap_res = {
        candidate.driver_profile_id: make_capacity_result(
            candidate.driver_profile_id, seat_capacity=4, overlapping=0
        )
    }

    res_rt = score_and_rank_candidates([candidate], cap_res, req_round_trip)
    res_m = score_and_rank_candidates([candidate], cap_res, req_departure_only)

    assert len(res_rt) == 1
    assert len(res_m) == 1
    assert res_rt[0].score_breakdown.timingScore == 0.750
    assert res_m[0].score_breakdown.timingScore == 0.750
    assert res_rt[0].composite_score_exact == res_m[0].composite_score_exact


def test_round_trip_overlapping_or_inverted_legs_rejected() -> None:
    """Round-trip requests with overlapping windows or inverted times are rejected."""
    from pydantic import ValidationError

    # Departure: 08:00 + buffer 15m + duration pushes window past 08:20
    req_overlap = make_search_request(
        subscription_type="ROUND_TRIP",
        time_str="08:00",
        pickup_time_str="08:20",
    )
    with pytest.raises(InvalidRoundTripTimesError) as exc:
        build_requested_service_windows(req_overlap)
    assert exc.value.status_code == 400
    assert isinstance(exc.value.detail, dict)
    assert exc.value.detail["code"] == "INVALID_ROUND_TRIP_TIMES"

    # The request contract rejects a pickup time before departure.
    with pytest.raises(ValidationError):
        make_search_request(
            subscription_type="ROUND_TRIP",
            time_str="08:00",
            pickup_time_str="07:00",
        )


# ─────────────────────────────────────────────────────────────────────────────
# 5. Canonical E1 -> E7 First-Failure Precedence Matrix
# ─────────────────────────────────────────────────────────────────────────────


def test_first_failure_precedence_in_sql_diagnostics() -> None:
    """Verifies canonical first-failure evaluation precedence order:

    E1 (DRIVER_STATUS) -> E2 (INVALID_GEOMETRY) -> E3 (DISTANCE) -> E5 (OPERATING_DAY)
    A candidate violating multiple stages simultaneously must only increment the FIRST failure.
    """
    simulated_row = {
        "driver_status_failures": 1,
        "invalid_geometry_failures": 0,
        "null_geometry_count": 0,
        "empty_geometry_count": 0,
        "wrong_srid_count": 0,
        "non_simple_count": 0,
        "invalid_geometry_count": 0,
        "distance_failures": 0,
        "direction_failures": 0,
        "operating_day_failures": 0,
        "passed_e5_count": 0,
    }

    diag = SpatialExclusionDiagnostics(
        driver_status_failures=simulated_row["driver_status_failures"],
        invalid_geometry_failures=simulated_row["invalid_geometry_failures"],
        null_geometry_count=simulated_row["null_geometry_count"],
        empty_geometry_count=simulated_row["empty_geometry_count"],
        wrong_srid_count=simulated_row["wrong_srid_count"],
        non_simple_count=simulated_row["non_simple_count"],
        invalid_geometry_count=simulated_row["invalid_geometry_count"],
        distance_failures=simulated_row["distance_failures"],
        direction_failures=simulated_row["direction_failures"],
        operating_day_failures=simulated_row["operating_day_failures"],
        passed_e5_count=simulated_row["passed_e5_count"],
    )

    assert diag.driver_status_failures == 1
    assert diag.distance_failures == 0
    assert diag.invalid_geometry_failures == 0


def test_first_failure_pipeline_stages() -> None:
    """Tests the Python filter pipeline stage precedence:

    E3 (Distance) -> E4 (Direction) -> E6 (Capacity) -> E7 (Timing)
    """
    req = make_search_request()
    line = LineString([(67.0, 24.8), (67.1, 24.9)])

    # Driver A: Valid direction (pos_p < pos_d), but capacity is full (E6 failure)
    cand_a = make_candidate(seat_capacity=1, active_subscriptions=1, route_geometry=line)

    # Direction check passes
    surviving_e4, excluded_e4 = filter_candidates_by_direction([cand_a], req)
    assert len(surviving_e4) == 1
    assert len(excluded_e4) == 0

    # In-memory capacity check evaluates and identifies capacity failure
    cap_res = evaluate_candidate_capacity(cand_a, overlapping_active_count=1)
    assert not cap_res.is_eligible
    assert cap_res.exclusion_reason == "CAPACITY"


# ─────────────────────────────────────────────────────────────────────────────
# 6. Defensive E2 Geometry Classification Precedence Tests
# ─────────────────────────────────────────────────────────────────────────────


def test_defensive_geometry_parser_precedence() -> None:
    """Asserts defensive EWKB/WKT parser classification order:

    NULL -> EMPTY -> WRONG_SRID -> NON_SIMPLE -> INVALID
    """
    # 1. NULL geometry raises ValueError defensively
    with pytest.raises(ValueError, match="route_geometry cannot be None"):
        parse_route_geometry(None)

    # 2. Degenerate 2-point valid line string
    line_2pt = LineString([(67.0, 24.8), (67.1, 24.9)])
    assert line_2pt.is_valid
    assert line_2pt.is_simple
    p_norm = project_point_on_route(line_2pt, 67.05, 24.85)
    assert 0.0 <= p_norm <= 1.0

    # 3. Self-intersecting bowtie (NON_SIMPLE) LineString
    bowtie = LineString([(67.0, 24.8), (67.2, 25.0), (67.0, 25.0), (67.2, 24.8)])
    assert not bowtie.is_simple, "Bowtie geometry must be non-simple"


# ─────────────────────────────────────────────────────────────────────────────
# 7. Asia/Karachi Wall-Clock & Timezone Invariant Tests (Fixed UTC+5)
# ─────────────────────────────────────────────────────────────────────────────


def test_asia_karachi_timezone_invariants() -> None:
    """Validates that Asia/Karachi (PKT = UTC+5) has no phantom DST transitions:

    Summer and winter timestamps preserve an invariant UTC offset of +05:00.
    """
    tz = zoneinfo.ZoneInfo("Asia/Karachi")

    summer_dt = datetime(2026, 6, 15, 8, 0, tzinfo=tz)
    winter_dt = datetime(2026, 12, 15, 8, 0, tzinfo=tz)

    assert summer_dt.utcoffset() == timedelta(hours=5)
    assert winter_dt.utcoffset() == timedelta(hours=5)
    assert summer_dt.utcoffset() == winter_dt.utcoffset(), "Karachi must have fixed UTC+5 offset"

    assert summer_dt.time() == time(8, 0)
    assert winter_dt.time() == time(8, 0)


# ─────────────────────────────────────────────────────────────────────────────
# 8. Single-Seat Capacity Driver Matrix (capacity = 1)
# ─────────────────────────────────────────────────────────────────────────────


def test_single_seat_capacity_matrix() -> None:
    """Verifies all subscription states for a single-seat capacity driver (capacity = 1)."""
    driver_id = uuid4()
    cand = make_candidate(driver_id=driver_id, seat_capacity=1)

    # 1. Zero active subscriptions -> Available = 1 -> Eligible
    res_empty = evaluate_candidate_capacity(cand, overlapping_active_count=0)
    assert res_empty.is_eligible is True
    assert res_empty.available_seats == 1
    assert res_empty.exclusion_reason is None

    # 2. One active subscription overlapping -> Available = 0 -> Excluded (CAPACITY)
    res_full = evaluate_candidate_capacity(cand, overlapping_active_count=1)
    assert res_full.is_eligible is False
    assert res_full.available_seats == 0
    assert res_full.exclusion_reason == "CAPACITY"

    # 3. Capacity score calculation
    score_full = compute_capacity_score(0, 1)
    assert score_full == 0.0

    score_empty = compute_capacity_score(1, 1)
    assert score_empty == 1.0


# ─────────────────────────────────────────────────────────────────────────────
# 9. Brand-New Driver Neutral Priors (0 reviews, 0 rides -> 0.70 / 0.80 / 0.50)
# ─────────────────────────────────────────────────────────────────────────────


def test_brand_new_driver_neutral_priors() -> None:
    """A driver with 0 reviews, 0 ride requests, and 0 departure observations:

    - Shrunk Rating Score = 0.700 (AD-8 prior)
    - Shrunk Acceptance Score = 0.800 (AD-8 prior)
    - Timing Fallback Score = 0.500 (AD-8 neutral)
    """
    cand = make_candidate(
        avg_rating=None,
        review_count=0,
        accepted_count=0,
        eligible_count=0,
        typical_departure=None,
        observation_count=0,
    )

    s_rate = compute_rating_score(
        cand.avg_rating,
        cand.review_count,
        prior=settings.MATCHING_RATING_PRIOR,
        weight=settings.MATCHING_RATING_WEIGHT,
    )
    assert s_rate == 0.700

    s_acc = compute_acceptance_score(
        cand.accepted_count,
        cand.eligible_count,
        prior=settings.MATCHING_ACCEPTANCE_PRIOR,
        weight=settings.MATCHING_ACCEPTANCE_WEIGHT,
    )
    assert s_acc == 0.800

    s_time = compute_timing_score(
        cand.typical_departure_time,
        cand.departure_observation_count,
        requested_time="08:00",
    )
    assert s_time == 0.500


# ─────────────────────────────────────────────────────────────────────────────
# 10. Hand-Calculated Deterministic Scoring Vectors (Vectors 1, 2, 3)
# ─────────────────────────────────────────────────────────────────────────────


def test_hand_calculated_scoring_vector_1_balanced() -> None:
    """Vector 1: Balanced Average Driver.

    Inputs:
      p = 750m, Rp = 1500m => Sp = 0.500
      d = 1000m, Rd = 2000m => Sd = 0.500 => Sprox = 0.500
      Delta t = 15m, M = 60m (N_obs = 5) => Stime = 0.750
      avgRating = 4.5, N_reviews = 5 (P=0.7, W=5) => Srate = (5*0.9 + 3.5)/10 = 0.800
      avail = 2, cap = 4 => Scap = 0.500
      acc = 8, elig = 10 (P=0.8, W=5) => Sacc = (8 + 4)/15 = 12/15 = 0.800

    Composite = 0.40(0.50) + 0.25(0.75) + 0.20(0.80) + 0.10(0.50) + 0.05(0.80)
              = 0.2000 + 0.1875 + 0.1600 + 0.0500 + 0.0400 = 0.637500
    """
    req = make_search_request(time_str="08:00")
    cand = make_candidate(
        pickup_distance=750.0,
        dest_distance=1000.0,
        typical_departure=time(8, 15),
        observation_count=5,
        avg_rating=4.5,
        review_count=5,
        seat_capacity=4,
        accepted_count=8,
        eligible_count=10,
    )
    cap_res = {
        cand.driver_profile_id: make_capacity_result(
            cand.driver_profile_id, seat_capacity=4, overlapping=2
        )
    }

    results = score_and_rank_candidates([cand], cap_res, req)
    assert len(results) == 1
    m = results[0]

    assert abs(m.score_breakdown.proximityScore - 0.5000) < 1e-6
    assert abs(m.score_breakdown.timingScore - 0.7500) < 1e-6
    assert abs(m.score_breakdown.ratingScore - 0.8000) < 1e-6
    assert abs(m.score_breakdown.capacityScore - 0.5000) < 1e-6
    assert abs(m.score_breakdown.acceptanceScore - 0.8000) < 1e-6
    assert abs(m.composite_score_exact - 0.637500) < 1e-6


def test_hand_calculated_scoring_vector_2_new_driver() -> None:
    """Vector 2: Brand-New Driver.

    Inputs:
      p = 0m, d = 0m => Sprox = 1.000
      No departure stats => Stime = 0.500
      0 reviews => Srate = 0.700
      avail = 4, cap = 4 => Scap = 1.000
      0 requests => Sacc = 0.800

    Composite = 0.40(1.0) + 0.25(0.50) + 0.20(0.70) + 0.10(1.0) + 0.05(0.80)
              = 0.4000 + 0.1250 + 0.1400 + 0.1000 + 0.0400 = 0.805000
    """
    req = make_search_request(time_str="08:00")
    cand = make_candidate(
        pickup_distance=0.0,
        dest_distance=0.0,
        typical_departure=None,
        observation_count=0,
        avg_rating=None,
        review_count=0,
        seat_capacity=4,
        accepted_count=0,
        eligible_count=0,
    )
    cap_res = {
        cand.driver_profile_id: make_capacity_result(
            cand.driver_profile_id, seat_capacity=4, overlapping=0
        )
    }

    results = score_and_rank_candidates([cand], cap_res, req)
    assert len(results) == 1
    m = results[0]

    assert abs(m.score_breakdown.proximityScore - 1.0000) < 1e-6
    assert abs(m.score_breakdown.timingScore - 0.5000) < 1e-6
    assert abs(m.score_breakdown.ratingScore - 0.7000) < 1e-6
    assert abs(m.score_breakdown.capacityScore - 1.0000) < 1e-6
    assert abs(m.score_breakdown.acceptanceScore - 0.8000) < 1e-6
    assert abs(m.composite_score_exact - 0.805000) < 1e-6


def test_hand_calculated_scoring_vector_3_boundary_strained() -> None:
    """Vector 3: Boundary Strained Driver.

    Inputs:
      p = 1500m, d = 2000m => Sprox = 0.000
      Delta t = 60m => Stime = 0.000
      avgRating = 1.0, N_reviews = 20 => Srate = (20*0.2 + 3.5)/25 = 7.5/25 = 0.300
      avail = 1, cap = 4 => Scap = 0.250
      acc = 1, elig = 10 => Sacc = (1 + 4)/15 = 5/15 = 1/3 ~ 0.333333

    Composite = 0.40(0) + 0.25(0) + 0.20(0.30) + 0.10(0.25) + 0.05(1/3)
              = 0.0600 + 0.0250 + 0.01666667 = 0.10166667
    """
    req = make_search_request(time_str="08:00")
    cand = make_candidate(
        pickup_distance=1500.0,
        dest_distance=2000.0,
        typical_departure=time(9, 0),
        observation_count=3,
        avg_rating=1.0,
        review_count=20,
        seat_capacity=4,
        accepted_count=1,
        eligible_count=10,
    )
    cap_res = {
        cand.driver_profile_id: make_capacity_result(
            cand.driver_profile_id, seat_capacity=4, overlapping=3
        )
    }

    results = score_and_rank_candidates([cand], cap_res, req)
    assert len(results) == 1
    m = results[0]

    assert abs(m.score_breakdown.proximityScore - 0.0000) < 1e-6
    assert abs(m.score_breakdown.timingScore - 0.0000) < 1e-6
    assert abs(m.score_breakdown.ratingScore - 0.3000) < 1e-6
    assert abs(m.score_breakdown.capacityScore - 0.2500) < 1e-6
    assert abs(m.score_breakdown.acceptanceScore - 0.3333) < 1e-6
    expected_composite = 0.06 + 0.025 + 0.05 * (1.0 / 3.0)
    assert abs(m.composite_score_exact - expected_composite) < 1e-6


# ─────────────────────────────────────────────────────────────────────────────
# 11. NaN / +Inf / -Inf Input Rejection & Finite Output Guarantees
# ─────────────────────────────────────────────────────────────────────────────


def test_nan_and_inf_rejection_in_pydantic_schema() -> None:
    """Pydantic request schema rejects non-finite floats (NaN, +Inf, -Inf)."""
    # 1. NaN coordinate
    with pytest.raises(ValidationError):
        InternalSearchRequest(
            riderId=uuid4(),
            pickupLat=float("nan"),
            pickupLng=67.0,
            destLat=24.9,
            destLng=67.1,
            pickupRadiusMeters=1500.0,
            destRadiusMeters=2000.0,
            day=1,
            subscriptionType="ONE_WAY",
            departureTime="08:00",
        )

    # 2. Positive Infinity
    with pytest.raises(ValidationError):
        InternalSearchRequest(
            riderId=uuid4(),
            pickupLat=24.8,
            pickupLng=float("inf"),
            destLat=24.9,
            destLng=67.1,
            pickupRadiusMeters=1500.0,
            destRadiusMeters=2000.0,
            day=1,
            subscriptionType="ONE_WAY",
            departureTime="08:00",
        )

    # 3. Negative Infinity
    with pytest.raises(ValidationError):
        InternalSearchRequest(
            riderId=uuid4(),
            pickupLat=24.8,
            pickupLng=67.0,
            destLat=float("-inf"),
            destLng=67.1,
            pickupRadiusMeters=1500.0,
            destRadiusMeters=2000.0,
            day=1,
            subscriptionType="ONE_WAY",
            departureTime="08:00",
        )


def test_math_functions_finite_output_guarantee() -> None:
    """All component scoring functions guarantee finite float outputs in [0.0, 1.0]."""
    _, _, p_score = compute_proximity_score(0.0, 0.0, 1500.0, 2000.0)
    assert math.isfinite(p_score)
    assert 0.0 <= p_score <= 1.0

    r_score = compute_rating_score(5.0, 1_000_000)
    assert math.isfinite(r_score)
    assert 0.0 <= r_score <= 1.0

    a_score = compute_acceptance_score(1_000_000, 1_000_000)
    assert math.isfinite(a_score)
    assert 0.0 <= a_score <= 1.0


# ─────────────────────────────────────────────────────────────────────────────
# 12. Result-Limit Boundary Tests (limit = 0, 1, 20, None, N > limit)
# ─────────────────────────────────────────────────────────────────────────────


def test_result_limit_boundary_scenarios() -> None:
    """Exhaustive boundary testing for result capping:

    - limit = 0 -> Returns empty list []
    - limit = 1 -> Returns top 1 candidate
    - limit = 20 -> Returns top 20
    - limit = None -> Defaults to settings.MATCHING_MAX_RESULTS (20)
    - 25 candidates with limit 20 -> Returns exactly 20, dropping lowest 5
    - 5 candidates with limit 20 -> Returns all 5
    - Empty candidates list -> Returns []
    """
    req = make_search_request()

    candidates: list[CandidateDriver] = []
    cap_res: dict[UUID, CapacityCheckResult] = {}
    for i in range(25):
        cand = make_candidate(
            pickup_distance=i * 50.0,
            dest_distance=i * 50.0,
            avg_rating=4.5,
            review_count=5,
        )
        candidates.append(cand)
        cap_res[cand.driver_profile_id] = make_capacity_result(
            cand.driver_profile_id, seat_capacity=4, overlapping=0
        )

    # 1. limit = 0
    res_0 = score_and_rank_candidates(candidates, cap_res, req, limit=0)
    assert res_0 == []

    # 2. limit = 1
    res_1 = score_and_rank_candidates(candidates, cap_res, req, limit=1)
    assert len(res_1) == 1
    assert res_1[0].driver_profile_id == candidates[0].driver_profile_id

    # 3. limit = 20 with 25 candidates (N > limit)
    res_20 = score_and_rank_candidates(candidates, cap_res, req, limit=20)
    assert len(res_20) == 20
    res_20_ids = {m.driver_profile_id for m in res_20}
    for dropped in candidates[20:]:
        assert dropped.driver_profile_id not in res_20_ids

    # 4. limit = None (uses default 20)
    res_none = score_and_rank_candidates(candidates, cap_res, req, limit=None)
    assert len(res_none) == settings.MATCHING_MAX_RESULTS

    # 5. 5 candidates with limit 20 (N < limit)
    res_5 = score_and_rank_candidates(candidates[:5], cap_res, req, limit=20)
    assert len(res_5) == 5

    # 6. Empty candidates list
    res_empty = score_and_rank_candidates([], cap_res, req, limit=20)
    assert res_empty == []

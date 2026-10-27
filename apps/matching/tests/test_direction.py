"""Unit, regression, and parity tests for corridor direction checking (Phase 1A Task 1.03).

Validates:
1. Endpoint separation validation (< 50m fail-fast with HTTP 422 INVALID_ROUTE_REQUEST).
2. ST_LineLocatePoint projection semantics on BaseGeometry.
3. Outbound (DEPARTURE), return (PICKUP), and dual-leg (ROUND_TRIP) corridor traversal.
4. Regression test proving elimination of the TRD §4.1 literal bug (B1 scope resolution).
5. Canonical tolerance POSITION_EPSILON = 1e-9 behavior (collocated projections excluded).
6. Short and degenerate corridor handling.
7. Cross-language canonical test vectors (AD-11: VEC-E4-01, VEC-ELIGIBLE-01, VEC-ELIGIBLE-02).
8. Live PostGIS ST_LineLocatePoint vs Shapely numerical and decision parity.
"""

from __future__ import annotations

import json
from datetime import time
from pathlib import Path
from uuid import UUID

import asyncpg
import pytest
from _database import matching_test_database_url
from shapely.geometry import LineString, Point

from app.matching.candidates import CandidateDriver
from app.matching.direction import (
    MIN_ENDPOINT_SEPARATION_METERS,
    POSITION_EPSILON,
    InvalidRouteRequestError,
    evaluate_direction,
    filter_candidates_by_direction,
    haversine_distance_meters,
    project_point_on_route,
    validate_endpoint_separation,
)
from app.schemas.internal_search import InternalSearchRequest

# Canonical test coordinates (Karachi)
KARACHI_ORIGIN_LNG = 67.0000
KARACHI_ORIGIN_LAT = 24.8500
KARACHI_DEST_LNG = 67.1000
KARACHI_DEST_LAT = 24.9500

# Canonical corridor LineString from Origin (0.0) to Dest (1.0)
CANONICAL_CORRIDOR = LineString(
    [
        (KARACHI_ORIGIN_LNG, KARACHI_ORIGIN_LAT),
        (67.0500, 24.9000),
        (KARACHI_DEST_LNG, KARACHI_DEST_LAT),
    ]
)


def make_search_request(
    pickup_lat: float = 24.8600,
    pickup_lng: float = 67.0100,
    dest_lat: float = 24.9400,
    dest_lng: float = 67.0900,
    subscription_type: str = "ONE_WAY",
    pickup_time: str | None = None,
) -> InternalSearchRequest:
    """Helper to build InternalSearchRequest."""
    return InternalSearchRequest(
        riderId=UUID("550e8400-e29b-41d4-a716-446655440000"),
        pickupLat=pickup_lat,
        pickupLng=pickup_lng,
        destLat=dest_lat,
        destLng=dest_lng,
        day=1,
        departureTime="07:30",
        subscriptionType=subscription_type,  # type: ignore[arg-type]
        **(
            {"pickupTime": pickup_time or "14:30"}
            if subscription_type == "ROUND_TRIP"
            else {}
        ),
        pickupRadiusMeters=1500.0,
        destRadiusMeters=2000.0,
    )


def make_candidate_driver(
    route: LineString,
    driver_id: str = "11111111-1111-4111-8111-111111111111",
) -> CandidateDriver:
    """Helper to build a CandidateDriver with a specific route geometry."""
    return CandidateDriver(
        driver_profile_id=UUID(driver_id),
        user_id=UUID("22222222-2222-4222-8222-222222222222"),
        seat_capacity=4,
        operating_days=[1, 2, 3, 4, 5],
        acceptance_rate=0.9,
        route_geometry=route,
        pickup_distance_meters=200.0,
        dest_distance_meters=300.0,
        avg_rating=4.5,
        review_count=10,
        active_subscriptions_count=2,
        typical_departure_time=time(7, 30),
        departure_observation_count=12,
    )


# ─── 1. Endpoint Separation Validation (< 50m) ──────────────────────────────────


def test_validate_endpoint_separation_identical_raises() -> None:
    """Identical pickup and destination (0m separation) raises HTTP 422 INVALID_ROUTE_REQUEST."""
    with pytest.raises(InvalidRouteRequestError) as exc_info:
        validate_endpoint_separation(24.86, 67.01, 24.86, 67.01)

    assert exc_info.value.status_code == 422
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail["code"] == "INVALID_ROUTE_REQUEST"
    assert "at least 50 meters" in exc_info.value.detail["message"]


def test_validate_endpoint_separation_too_close_raises() -> None:
    """Points separated by ~30m (< 50m) raises HTTP 422 INVALID_ROUTE_REQUEST."""
    # ~0.00025 degrees latitude in Karachi is roughly 27.7 meters
    lat1, lng1 = 24.86000, 67.01000
    lat2, lng2 = 24.86025, 67.01000

    dist = haversine_distance_meters(lat1, lng1, lat2, lng2)
    assert dist < MIN_ENDPOINT_SEPARATION_METERS

    with pytest.raises(InvalidRouteRequestError) as exc_info:
        validate_endpoint_separation(lat1, lng1, lat2, lng2)

    assert exc_info.value.status_code == 422
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail["code"] == "INVALID_ROUTE_REQUEST"


def test_validate_endpoint_separation_boundary_valid() -> None:
    """Points separated by ~55m (> 50m) pass validation and return distance."""
    # ~0.0005 degrees latitude is roughly 55.4 meters
    lat1, lng1 = 24.8600, 67.0100
    lat2, lng2 = 24.8605, 67.0100

    dist = validate_endpoint_separation(lat1, lng1, lat2, lng2)
    assert dist >= 50.0
    assert 50.0 < dist < 65.0


def test_validate_endpoint_separation_normal_trip_valid() -> None:
    """Standard commuter trip (several km) passes cleanly."""
    dist = validate_endpoint_separation(
        KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG, KARACHI_DEST_LAT, KARACHI_DEST_LNG
    )
    assert dist > 10000.0  # ~15km


# ─── 2. Polyline Projection (ST_LineLocatePoint Semantics) ───────────────────────


def test_project_point_on_route_valid_range() -> None:
    """Projection returns float in [0.0, 1.0]."""
    # Start of corridor
    p_start = project_point_on_route(CANONICAL_CORRIDOR, KARACHI_ORIGIN_LNG, KARACHI_ORIGIN_LAT)
    assert p_start == pytest.approx(0.0, abs=1e-6)

    # Middle of corridor
    p_mid = project_point_on_route(CANONICAL_CORRIDOR, 67.0500, 24.9000)
    assert p_mid == pytest.approx(0.5, abs=1e-6)

    # End of corridor
    p_end = project_point_on_route(CANONICAL_CORRIDOR, KARACHI_DEST_LNG, KARACHI_DEST_LAT)
    assert p_end == pytest.approx(1.0, abs=1e-6)


def test_project_point_on_route_empty_and_zero_length_defensive() -> None:
    """Empty or zero-length geometries return 0.0 without throwing exceptions."""
    empty_line = LineString([])
    assert project_point_on_route(empty_line, 67.0, 24.8) == 0.0

    zero_len_line = LineString([(67.0, 24.8), (67.0, 24.8)])
    assert project_point_on_route(zero_len_line, 67.0, 24.8) == 0.0


# ─── 3. Corridor Direction Traversal (DEPARTURE, PICKUP, ROUND_TRIP) ───────────


def test_departure_direction_forward_eligible() -> None:
    """DEPARTURE search: pos_pickup < pos_dest passes direction check."""
    # Pickup near origin (pos ~0.1), dropoff near destination (pos ~0.9)
    result = evaluate_direction(
        route_geometry=CANONICAL_CORRIDOR,
        pickup_lat=24.86,
        pickup_lng=67.01,
        dest_lat=24.94,
        dest_lng=67.09,
        subscription_type="ONE_WAY",
    )
    assert result.is_eligible is True
    assert result.pos_pickup < result.pos_dest
    assert result.exclusion_reason is None


def test_departure_direction_reverse_excluded() -> None:
    """DEPARTURE search: pos_pickup > pos_dest fails direction check with DIRECTION."""
    # Inverted: pickup near destination (pos ~0.9), dropoff near origin (pos ~0.1)
    result = evaluate_direction(
        route_geometry=CANONICAL_CORRIDOR,
        pickup_lat=24.94,
        pickup_lng=67.09,
        dest_lat=24.86,
        dest_lng=67.01,
        subscription_type="ONE_WAY",
    )
    assert result.is_eligible is False
    assert result.pos_pickup > result.pos_dest
    assert result.exclusion_reason == "DIRECTION"


def test_pickup_segment_is_not_a_commute_type() -> None:
    """PICKUP is a round-trip segment; consumer commute types are ONE_WAY/ROUND_TRIP."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        make_search_request(subscription_type="PICKUP")


def test_round_trip_corridor_both_legs_eligible() -> None:
    """ROUND_TRIP search: Corridor matching morning outbound satisfies both legs per B1."""
    result = evaluate_direction(
        route_geometry=CANONICAL_CORRIDOR,
        pickup_lat=24.86,
        pickup_lng=67.01,
        dest_lat=24.94,
        dest_lng=67.09,
        subscription_type="ROUND_TRIP",
    )
    assert result.is_eligible is True
    assert result.pos_pickup < result.pos_dest
    assert result.exclusion_reason is None


def test_round_trip_reverse_corridor_excluded() -> None:
    """ROUND_TRIP search: Reverse corridor (pos_pickup > pos_dest) fails for ROUND_TRIP."""
    result = evaluate_direction(
        route_geometry=CANONICAL_CORRIDOR,
        pickup_lat=24.94,
        pickup_lng=67.09,
        dest_lat=24.86,
        dest_lng=67.01,
        subscription_type="ROUND_TRIP",
    )
    assert result.is_eligible is False
    assert result.exclusion_reason == "DIRECTION"


def test_unknown_subscription_type_ineligible() -> None:
    """Unknown subscription type defaults to ineligible."""
    result = evaluate_direction(
        route_geometry=CANONICAL_CORRIDOR,
        pickup_lat=24.86,
        pickup_lng=67.01,
        dest_lat=24.94,
        dest_lng=67.09,
        subscription_type="NIGHT",
    )
    assert result.is_eligible is False
    assert result.exclusion_reason == "DIRECTION"


# ─── 4. TRD §4.1 Literal Defect Regression Test (B1 Resolution) ─────────────────


def test_trd_literal_bug_regression() -> None:
    """Regression test proving elimination of the TRD §4.1 Step 2 defect (B1).

    Under TRD §4.1 literal text:
    Both legs evaluated `pos_pickup < pos_dest`.
    For a return trip (pickup=School, dest=Home):
    pos_school > pos_home, so literal check `pos_school < pos_home` ALWAYS evaluated to False,
    causing 100% of ROUND_TRIP searches to return zero drivers!

    Under B1 per-leg corridor model:
    Outbound leg: pos_home < pos_school
    Return leg:   pos_home < pos_school on canonical corridor (served in reverse).
    Eligible!
    """
    pos_home = project_point_on_route(CANONICAL_CORRIDOR, 67.01, 24.86)
    pos_school = project_point_on_route(CANONICAL_CORRIDOR, 67.09, 24.94)
    assert pos_home < pos_school

    # 1. Simulate the literal TRD §4.1 check on the return leg:
    # On the return leg, child pickup is School and dropoff is Home:
    return_pickup_pos = pos_school
    return_dropoff_pos = pos_home
    literal_trd_return_eligible = return_pickup_pos < return_dropoff_pos
    assert literal_trd_return_eligible is False, "Literal TRD algorithm must reject the return leg"

    # 2. Verify that our B1 implementation accepts the ROUND_TRIP candidate:
    b1_result = evaluate_direction(
        route_geometry=CANONICAL_CORRIDOR,
        pickup_lat=24.86,
        pickup_lng=67.01,
        dest_lat=24.94,
        dest_lng=67.09,
        subscription_type="ROUND_TRIP",
    )
    assert b1_result.is_eligible is True, (
        "B1 per-leg algorithm must accept the eligible ROUND_TRIP driver"
    )


# ─── 5. Canonical Tolerance & Collocated Projections (POSITION_EPSILON) ─────────


def test_direction_collocated_projection_excluded() -> None:
    """Points projecting to identical positions on the line fail direction check."""
    # Perpendicular points projecting to the exact same middle vertex (67.05, 24.90)
    result = evaluate_direction(
        route_geometry=CANONICAL_CORRIDOR,
        pickup_lat=24.9001,
        pickup_lng=67.0499,
        dest_lat=24.8999,
        dest_lng=67.0501,
        subscription_type="ONE_WAY",
    )
    # The projected positions differ by less than 1e-9
    assert abs(result.pos_pickup - result.pos_dest) < POSITION_EPSILON
    assert result.is_eligible is False
    assert result.exclusion_reason == "DIRECTION"


def test_direction_sub_epsilon_boundary_parity() -> None:
    """Points whose projection difference is sub-epsilon (e.g. 1e-10) are excluded."""
    # Construct a line where points are 1e-10 apart
    line = LineString([(0.0, 0.0), (1.0, 0.0)])
    p_pickup = Point(0.5000000000, 0.0)
    p_dest = Point(0.5000000001, 0.0)  # diff = 1e-10 < 1e-9

    result = evaluate_direction(
        route_geometry=line,
        pickup_lat=p_pickup.y,
        pickup_lng=p_pickup.x,
        dest_lat=p_dest.y,
        dest_lng=p_dest.x,
        subscription_type="ONE_WAY",
    )
    assert result.is_eligible is False
    assert result.exclusion_reason == "DIRECTION"


def test_direction_very_short_corridor() -> None:
    """Very short route segments (e.g. 60m) normalize cleanly and evaluate direction."""
    short_line = LineString(
        [
            (67.0000, 24.8600),
            (67.0005, 24.8605),  # ~75m
        ]
    )
    result = evaluate_direction(
        route_geometry=short_line,
        pickup_lat=24.8601,
        pickup_lng=67.0001,
        dest_lat=24.8604,
        dest_lng=67.0004,
        subscription_type="ONE_WAY",
    )
    assert result.is_eligible is True
    assert 0.0 < result.pos_pickup < result.pos_dest < 1.0


# ─── 6. Shared Cross-Language Test Vectors (AD-11) ───────────────────────────────


def test_eligibility_vectors_direction_stage() -> None:
    """Validate canonical cross-language test vectors against direction logic (AD-11)."""
    vectors_path = (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "contracts"
        / "test-vectors"
        / "eligibility.json"
    )
    assert vectors_path.is_file()

    with open(vectors_path, encoding="utf-8") as f:
        data = json.load(f)

    vectors = {v["id"]: v for v in data["vectors"]}

    # VEC-E4-01: Outbound direction check fails (pos_pickup >= pos_dest)
    vec_e4 = vectors["VEC-E4-01"]
    pos_pickup_e4 = vec_e4["driver"]["posPickup"]
    pos_dest_e4 = vec_e4["driver"]["posDest"]
    # Synthesize LineString matching those exact normalized positions
    test_line = LineString([(0.0, 0.0), (1.0, 0.0)])
    result_e4 = evaluate_direction(
        route_geometry=test_line,
        pickup_lat=0.0,
        pickup_lng=pos_pickup_e4,
        dest_lat=0.0,
        dest_lng=pos_dest_e4,
        subscription_type=vec_e4["request"]["subscriptionType"],
    )
    assert result_e4.is_eligible is False
    assert result_e4.exclusion_reason == vec_e4["expectedExclusionCode"]

    # VEC-ELIGIBLE-01: DEPARTURE eligible (pos_pickup < pos_dest)
    vec_el1 = vectors["VEC-ELIGIBLE-01"]
    result_el1 = evaluate_direction(
        route_geometry=test_line,
        pickup_lat=0.0,
        pickup_lng=vec_el1["driver"]["posPickup"],
        dest_lat=0.0,
        dest_lng=vec_el1["driver"]["posDest"],
        subscription_type=vec_el1["request"]["subscriptionType"],
    )
    assert result_el1.is_eligible is True
    assert result_el1.exclusion_reason is None

    # VEC-ELIGIBLE-02: ROUND_TRIP eligible on undirected corridor
    vec_el2 = vectors["VEC-ELIGIBLE-02"]
    result_el2 = evaluate_direction(
        route_geometry=test_line,
        pickup_lat=0.0,
        pickup_lng=vec_el2["driver"]["posPickup"],
        dest_lat=0.0,
        dest_lng=vec_el2["driver"]["posDest"],
        subscription_type=vec_el2["request"]["subscriptionType"],
    )
    assert result_el2.is_eligible is True
    assert result_el2.exclusion_reason is None


# ─── 7. Batch Candidate Filtering & Observability ───────────────────────────────


def test_filter_candidates_by_direction() -> None:
    """filter_candidates_by_direction partitions candidates and logs exclusions."""
    forward_line = CANONICAL_CORRIDOR
    # Reverse corridor digitized in opposite direction
    reverse_line = LineString(list(CANONICAL_CORRIDOR.coords)[::-1])

    c_forward = make_candidate_driver(forward_line, "11111111-1111-1111-1111-111111111111")
    c_reverse = make_candidate_driver(reverse_line, "22222222-2222-2222-2222-222222222222")

    req = make_search_request(subscription_type="ONE_WAY")
    eligible, excluded = filter_candidates_by_direction([c_forward, c_reverse], req)

    assert len(eligible) == 1
    assert str(eligible[0].driver_profile_id) == str(c_forward.driver_profile_id)

    assert len(excluded) == 1
    assert str(excluded[0][0].driver_profile_id) == str(c_reverse.driver_profile_id)
    assert excluded[0][1].exclusion_reason == "DIRECTION"


# ─── 8. Live PostGIS Database Parity Tests ──────────────────────────────────────


@pytest.mark.asyncio
async def test_live_postgis_st_linelocatepoint_shapely_parity() -> None:
    """Live database parity test comparing PostGIS ST_LineLocatePoint with Shapely project.

    Proves:
    1. Shapely line.project and PostGIS ST_LineLocatePoint return identical float values (abs < 1e-7).
    2. Both layers produce identical eligibility decisions under POSITION_EPSILON = 1e-9.
    """
    try:
        database_url = matching_test_database_url()
        if database_url is None:
            pytest.skip("MATCHING_TEST_DATABASE_URL must name a dedicated test database")
        conn = await asyncpg.connect(database_url, timeout=5.0)
    except Exception:
        pytest.skip("Local PostgreSQL container not reachable")

    try:
        # Test line string WKT
        line_wkt = "LINESTRING(67.000 24.850, 67.050 24.900, 67.100 24.950)"
        line_geom = LineString([(67.000, 24.850), (67.050, 24.900), (67.100, 24.950)])

        test_points = [
            (67.010, 24.860),
            (67.040, 24.890),
            (67.050, 24.900),
            (67.080, 24.930),
            (67.090, 24.940),
        ]

        for lng, lat in test_points:
            # PostGIS projection
            pg_val = await conn.fetchval(
                "SELECT ST_LineLocatePoint(ST_GeomFromText($1, 4326), ST_SetSRID(ST_MakePoint($2, $3), 4326)::geometry);",
                line_wkt,
                lng,
                lat,
            )
            # Shapely projection
            py_val = project_point_on_route(line_geom, lng, lat)

            assert pg_val == pytest.approx(py_val, abs=1e-7), (
                f"Mismatch for point ({lng}, {lat}): PostGIS={pg_val}, Shapely={py_val}"
            )

        # Check collocated sub-epsilon parity in SQL vs Python:
        # Point 1 and Point 2 differing by 1e-10
        sql_collocated = await conn.fetchval(
            """
            WITH proj AS (
                SELECT
                  ST_LineLocatePoint(ST_GeomFromText('LINESTRING(0 0, 1 0)', 4326), ST_SetSRID(ST_MakePoint(0.5000000000, 0), 4326)) AS p1,
                  ST_LineLocatePoint(ST_GeomFromText('LINESTRING(0 0, 1 0)', 4326), ST_SetSRID(ST_MakePoint(0.5000000001, 0), 4326)) AS p2
            )
            SELECT (p1 >= p2 - 1e-9) AS is_departure_excluded FROM proj;
            """
        )
        assert sql_collocated is True, "SQL must exclude sub-epsilon difference for DEPARTURE"

        # Python evaluation of the exact same points:
        sub_eps_line = LineString([(0.0, 0.0), (1.0, 0.0)])
        py_res = evaluate_direction(
            route_geometry=sub_eps_line,
            pickup_lat=0.0,
            pickup_lng=0.5000000000,
            dest_lat=0.0,
            dest_lng=0.5000000001,
            subscription_type="ONE_WAY",
        )
        assert py_res.is_eligible is False, "Python must exclude sub-epsilon difference for DEPARTURE"
        assert py_res.exclusion_reason == "DIRECTION"

    finally:
        await conn.close()

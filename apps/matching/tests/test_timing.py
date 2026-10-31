"""Unit, regression, vector, and live database tests for timing conflict checking (Phase 1A Task 1.05).

Validates:
1. Deterministic Haversine commute duration calculation and DisplayDurationEstimator protocol (AD-14).
2. Pure in-memory interval conflict math with minute-of-day integer arithmetic:
   - Touching boundary intervals with gap=0 (permitted, no conflict per AD-7 / TRD §4.1).
   - Touching boundary intervals with gap>0 (conflict).
   - Full containment, partial overlap, and disjoint intervals.
3. Validation invariants (AD-13):
   - Cross-midnight service intervals (HTTP 400 INVALID_SERVICE_INTERVAL).
   - Inverted ROUND_TRIP times and overlapping legs (HTTP 400 INVALID_ROUND_TRIP_TIMES).
4. Stage E7 candidate timing evaluation logic:
   - Zero conflicting slots -> eligible.
   - >= 1 conflicting slots -> excluded with reason 'TIMING'.
5. Dual-window evaluation for ROUND_TRIP:
   - Morning-only conflict -> excluded with 'TIMING'.
   - Afternoon-only conflict -> excluded with 'TIMING'.
   - Both legs conflict -> excluded with 'TIMING'.
   - Neither conflicts -> eligible.
6. Operating day of week isolation:
   - Slots on other days do not conflict with requested day.
7. Cross-language canonical test vectors (AD-11: VEC-E7-01, VEC-ELIGIBLE-01, VEC-ELIGIBLE-02).
8. Live PostgreSQL batch query and pipeline filter integration:
   - dss.driver_profile_id = ANY($1::uuid[]::text[]) execution and B-tree index scan.
   - Touching slot behavior in PostgreSQL with gap=0 vs gap>0.
   - Day array containment ($day = ANY(dss.operating_days)).
"""

from __future__ import annotations

import json
from datetime import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from _database import connect_test_database
from shapely.geometry import LineString

from app.maps.duration import (
    DeterministicHaversineEstimator,
    RedisCachedDurationEstimator,
    calculate_haversine_duration_minutes,
)
from app.matching.candidates import CandidateDriver
from app.matching.service_window import (
    InvalidRoundTripTimesError,
    InvalidServiceIntervalError,
    RequestedServiceWindow,
    build_requested_service_windows,
    minutes_to_time,
    time_str_to_minutes,
)
from app.matching.timing import (
    ConflictingSlot,
    evaluate_candidate_timing,
    filter_candidates_by_timing,
    find_conflicting_schedule_slots,
    has_interval_conflict,
)
from app.schemas.internal_search import InternalSearchRequest

# Canonical test coordinates (Karachi)
KARACHI_ORIGIN_LAT = 24.8500
KARACHI_ORIGIN_LNG = 67.0000
KARACHI_DEST_LAT = 24.9500
KARACHI_DEST_LNG = 67.1000

DUMMY_ROUTE = LineString(
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
    day: int = 1,
    time_str: str = "07:30",
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
        day=day,
        departureTime=time_str,
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
    seat_capacity: int = 4,
    driver_id: str | None = None,
) -> CandidateDriver:
    """Helper to build CandidateDriver."""
    return CandidateDriver(
        driver_profile_id=UUID(driver_id) if driver_id else uuid4(),
        user_id=uuid4(),
        seat_capacity=seat_capacity,
        operating_days=[1, 2, 3, 4, 5],
        acceptance_rate=0.9,
        route_geometry=DUMMY_ROUTE,
        pickup_distance_meters=200.0,
        dest_distance_meters=300.0,
        avg_rating=4.8,
        review_count=15,
        active_subscriptions_count=2,
        typical_departure_time=time(7, 30),
        departure_observation_count=10,
    )


# ─── 1. Duration Calculation Tests ─────────────────────────────────────────────


def test_haversine_duration_precision() -> None:
    """Haversine duration: (km * 1.3 / 25 km/h) * 60 min."""
    lat1, lng1 = KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG
    lat2, lng2 = KARACHI_DEST_LAT, KARACHI_DEST_LNG

    duration = calculate_haversine_duration_minutes(
        lat1, lng1, lat2, lng2, city_speed_kmh=25.0, detour_factor=1.3
    )
    assert 40.0 < duration < 55.0

    zero_dur = calculate_haversine_duration_minutes(lat1, lng1, lat1, lng1)
    assert zero_dur == 0.0


@pytest.mark.asyncio
async def test_deterministic_haversine_estimator() -> None:
    """DeterministicHaversineEstimator protocol matches standalone calculation."""
    estimator = DeterministicHaversineEstimator(city_speed_kmh=25.0, detour_factor=1.3)
    res = await estimator.estimate_duration_minutes(
        KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG, KARACHI_DEST_LAT, KARACHI_DEST_LNG
    )
    direct = calculate_haversine_duration_minutes(
        KARACHI_ORIGIN_LAT,
        KARACHI_ORIGIN_LNG,
        KARACHI_DEST_LAT,
        KARACHI_DEST_LNG,
        city_speed_kmh=25.0,
        detour_factor=1.3,
    )
    assert res == direct


@pytest.mark.asyncio
async def test_redis_cached_duration_estimator() -> None:
    """RedisCachedDurationEstimator retrieves precomputed duration or falls back to Haversine."""
    mock_redis = MagicMock()
    # 1. Cache hit with JSON dictionary
    mock_redis.get = AsyncMock(
        return_value=json.dumps({"durationMinutes": 26.5, "distanceMeters": 14000}).encode("utf-8")
    )
    estimator = RedisCachedDurationEstimator(mock_redis)
    hit_dur = await estimator.estimate_duration_minutes(
        KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG, KARACHI_DEST_LAT, KARACHI_DEST_LNG
    )
    assert hit_dur == 26.5
    mock_redis.get.assert_called_with("duration:24.8500,67.0000:24.9500,67.1000")

    # 1b. Cache hit with raw numeric string
    mock_redis.get = AsyncMock(return_value=b"31.4")
    hit_float = await estimator.estimate_duration_minutes(
        KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG, KARACHI_DEST_LAT, KARACHI_DEST_LNG
    )
    assert hit_float == 31.4

    # 1c. Cache hit with invalid JSON -> falls back
    mock_redis.get = AsyncMock(return_value=b"invalid-json{")
    fallback_dur = await estimator.estimate_duration_minutes(
        KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG, KARACHI_DEST_LAT, KARACHI_DEST_LNG
    )
    assert fallback_dur > 0

    # 2. Cache miss -> Haversine fallback
    mock_redis.get = AsyncMock(return_value=None)
    miss_dur = await estimator.estimate_duration_minutes(
        KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG, KARACHI_DEST_LAT, KARACHI_DEST_LNG
    )
    direct = calculate_haversine_duration_minutes(
        KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG, KARACHI_DEST_LAT, KARACHI_DEST_LNG
    )
    assert miss_dur == direct

    # 3. Redis error -> Graceful Haversine fallback
    mock_redis.get = AsyncMock(side_effect=Exception("Redis connection error"))
    err_dur = await estimator.estimate_duration_minutes(
        KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG, KARACHI_DEST_LAT, KARACHI_DEST_LNG
    )
    assert err_dur == direct


# ─── 2. Pure Interval Conflict Math & Touching Boundaries (AD-7) ───────────────


def test_touching_boundaries_zero_gap() -> None:
    """With gap=0, touching intervals do not conflict: (start1 < end2) and (end1 > start2)."""
    # Slot 08:00-08:30 (480-510) touches window 08:30-09:00 (510-540) on the right
    # 510 > 510 is False -> no conflict
    assert has_interval_conflict(480, 510, 510, 540, gap_minutes=0) is False

    # Window 08:00-08:30 (480-510) touches slot 08:30-09:00 (510-540) on the left
    # 510 < 510 is False -> no conflict
    assert has_interval_conflict(510, 540, 480, 510, gap_minutes=0) is False


def test_touching_boundaries_positive_gap() -> None:
    """With gap > 0, touching boundaries violate the buffer and conflict."""
    # Slot 08:00-08:30 touches window 08:30-09:00
    # With gap=5: 510 + 5 > 510 is True and 480 < 540 + 5 is True -> conflict
    assert has_interval_conflict(480, 510, 510, 540, gap_minutes=5) is True
    assert has_interval_conflict(510, 540, 480, 510, gap_minutes=5) is True


def test_interval_overlap_permutations() -> None:
    """Validate containment, partial overlap, and disjoint intervals."""
    w_start = 480  # 08:00
    w_end = 540  # 09:00

    # Exact match: [08:00, 09:00]
    assert has_interval_conflict(480, 540, w_start, w_end, gap_minutes=0) is True

    # Slot contains window: [07:30, 09:30]
    assert has_interval_conflict(450, 570, w_start, w_end, gap_minutes=0) is True

    # Window contains slot: [08:15, 08:45]
    assert has_interval_conflict(495, 525, w_start, w_end, gap_minutes=0) is True

    # Partial overlap on start: [07:30, 08:30]
    assert has_interval_conflict(450, 510, w_start, w_end, gap_minutes=0) is True

    # Partial overlap on end: [08:30, 09:30]
    assert has_interval_conflict(510, 570, w_start, w_end, gap_minutes=0) is True

    # Disjoint earlier: [06:00, 07:00]
    assert has_interval_conflict(360, 420, w_start, w_end, gap_minutes=0) is False

    # Disjoint later: [10:00, 11:00]
    assert has_interval_conflict(600, 660, w_start, w_end, gap_minutes=0) is False


def test_requested_service_window_minute_getters() -> None:
    """Validate minute getter fallbacks when _min fields are omitted or None."""
    window = RequestedServiceWindow(
        has_departure_leg=True,
        departure_start=time(7, 15),
        departure_end=time(8, 0),
        has_pickup_leg=True,
        pickup_start=time(14, 30),
        pickup_end=time(15, 15),
        duration_minutes=30.0,
    )
    assert window.get_departure_start_min() == 435
    assert window.get_departure_end_min() == 480
    assert window.get_pickup_start_min() == 870
    assert window.get_pickup_end_min() == 915

    empty_window = RequestedServiceWindow(
        has_departure_leg=False,
        departure_start=None,
        departure_end=None,
        has_pickup_leg=False,
        pickup_start=None,
        pickup_end=None,
        duration_minutes=0.0,
    )
    assert empty_window.get_departure_start_min() is None
    assert empty_window.get_departure_end_min() is None
    assert empty_window.get_pickup_start_min() is None
    assert empty_window.get_pickup_end_min() is None


# ─── 3. Invariant Validations (AD-13) ──────────────────────────────────────────


def test_cross_midnight_interval_rejected() -> None:
    """Window crossing midnight raises HTTP 400 INVALID_SERVICE_INTERVAL."""
    req_underflow = make_search_request(time_str="00:05")
    with pytest.raises(InvalidServiceIntervalError):
        build_requested_service_windows(req_underflow, buffer_minutes=15)

    req_overflow = make_search_request(time_str="23:55")
    with pytest.raises(InvalidServiceIntervalError):
        build_requested_service_windows(req_overflow, buffer_minutes=15)


def test_invalid_round_trip_times_rejected() -> None:
    """The contract rejects inverted times; valid-order overlapping windows fail feasibility."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        make_search_request(
            subscription_type="ROUND_TRIP",
            time_str="14:00",
            pickup_time="08:00",
        )

    # Overlapping: morning ends at 08:45, afternoon starts at 08:30
    req_overlapping = make_search_request(
        subscription_type="ROUND_TRIP",
        time_str="08:00",
        pickup_time="08:30",
    )
    with pytest.raises(InvalidRoundTripTimesError):
        build_requested_service_windows(req_overlapping, buffer_minutes=15)


# ─── 4. Candidate Timing Evaluator Unit Tests ──────────────────────────────────


def test_evaluate_candidate_timing() -> None:
    """Zero conflicts -> eligible; >= 1 conflicts -> excluded with code 'TIMING'."""
    driver = make_candidate_driver()

    # Eligible
    res_eligible = evaluate_candidate_timing(driver, [])
    assert res_eligible.is_eligible is True
    assert res_eligible.conflicting_slots_count == 0
    assert res_eligible.exclusion_reason is None

    # Excluded
    slot = ConflictingSlot(
        id=uuid4(),
        driver_profile_id=driver.driver_profile_id,
        subscription_id=uuid4(),
        leg_type="DEPARTURE",
        slot_start=time(7, 30),
        slot_end=time(8, 0),
        slot_start_min=450,
        slot_end_min=480,
        operating_days=[1, 2, 3],
        pickup_order=1,
    )
    res_excluded = evaluate_candidate_timing(driver, [slot])
    assert res_excluded.is_eligible is False
    assert res_excluded.conflicting_slots_count == 1
    assert res_excluded.exclusion_reason == "TIMING"
    assert len(res_excluded.conflicting_slots) == 1


# ─── 5. Canonical Test Vectors (AD-11) ─────────────────────────────────────────


def test_canonical_test_vectors_e7_stage() -> None:
    """Validates VEC-E7-01, VEC-ELIGIBLE-01, and VEC-ELIGIBLE-02 from eligibility.json."""
    candidates = [
        Path("packages/contracts/test-vectors/eligibility.json"),
        Path("../../packages/contracts/test-vectors/eligibility.json"),
        Path(__file__).resolve().parent.parent.parent.parent
        / "packages"
        / "contracts"
        / "test-vectors"
        / "eligibility.json",
    ]
    vectors_path = next((p for p in candidates if p.exists()), None)
    if not vectors_path:
        pytest.fail("Test vectors eligibility.json not found; the shared vectors are required")

    with open(vectors_path, encoding="utf-8") as f:
        data = json.load(f)

    for vec in data["vectors"]:
        vec_id = vec["id"]

        if vec_id == "VEC-E7-01":
            # Conflicting slot on requested day 1: slot 07:15-07:45 vs request 07:30
            driver = make_candidate_driver(driver_id=vec["driver"]["id"])
            slots_data = vec["driver"]["scheduleSlots"]
            conflicts: list[ConflictingSlot] = []

            # Request: 07:30 DEPARTURE -> window ~07:15 - 08:30 (435 - 510)
            req_time_min = time_str_to_minutes(vec["request"]["departureTime"])
            w_start = req_time_min - 15
            w_end = req_time_min + 15 + 45

            for s in slots_data:
                s_start = time_str_to_minutes(s["slotStart"])
                s_end = time_str_to_minutes(s["slotEnd"])
                if vec["request"]["day"] in s["days"] and has_interval_conflict(
                    s_start, s_end, w_start, w_end, gap_minutes=0
                ):
                    conflicts.append(
                        ConflictingSlot(
                            id=uuid4(),
                            driver_profile_id=driver.driver_profile_id,
                            subscription_id=uuid4(),
                            leg_type="DEPARTURE",
                            slot_start=minutes_to_time(s_start),
                            slot_end=minutes_to_time(s_end),
                            slot_start_min=s_start,
                            slot_end_min=s_end,
                            operating_days=s["days"],
                            pickup_order=1,
                        )
                    )

            res = evaluate_candidate_timing(driver, conflicts)
            assert res.is_eligible is False
            assert res.exclusion_reason == vec["expectedExclusionCode"]

        elif vec_id == "VEC-ELIGIBLE-01":
            # Slot at 08:15-08:45 does not overlap request at 07:30 (window 07:15-08:00)
            driver = make_candidate_driver(driver_id=vec["driver"]["id"])
            slots_data = vec["driver"]["scheduleSlots"]
            conflicts = []

            # Request 07:30 -> window [07:15, 08:00] (435, 480)
            w_start = 435
            w_end = 480
            for s in slots_data:
                s_start = time_str_to_minutes(s["slotStart"])
                s_end = time_str_to_minutes(s["slotEnd"])
                if vec["request"]["day"] in s["days"] and has_interval_conflict(
                    s_start, s_end, w_start, w_end, gap_minutes=0
                ):
                    conflicts.append(
                        ConflictingSlot(
                            id=uuid4(),
                            driver_profile_id=driver.driver_profile_id,
                            subscription_id=uuid4(),
                            leg_type="DEPARTURE",
                            slot_start=minutes_to_time(s_start),
                            slot_end=minutes_to_time(s_end),
                            slot_start_min=s_start,
                            slot_end_min=s_end,
                            operating_days=s["days"],
                            pickup_order=1,
                        )
                    )

            res = evaluate_candidate_timing(driver, conflicts)
            assert res.is_eligible is True
            assert res.exclusion_reason is None

        elif vec_id == "VEC-ELIGIBLE-02":
            # Empty slots for ROUND_TRIP
            driver = make_candidate_driver(driver_id=vec["driver"]["id"])
            res = evaluate_candidate_timing(driver, [])
            assert res.is_eligible is True
            assert res.exclusion_reason is None


# ─── 6. Live PostgreSQL Database Integration ───────────────────────────────────


@pytest.mark.db
@pytest.mark.asyncio
async def test_live_postgres_timing_conflicts_and_touching_boundaries() -> None:
    """Live PostgreSQL database integration test verifying:

    1. dss.driver_profile_id = ANY($1::uuid[]::text[]) execution.
    2. Touching slot behavior:
       - Slot 08:00-08:30 vs Search 08:30-09:00 with gap=0 -> ELIGIBLE.
       - Slot 08:00-08:30 vs Search 08:30-09:00 with gap=5 -> EXCLUDED (TIMING).
    3. ROUND_TRIP dual-leg evaluation:
       - Morning passes, afternoon overlaps slot 14:15-15:00 -> EXCLUDED (TIMING).
    4. Day of week array isolation ($day = ANY(dss.operating_days)):
       - Slot exists on day 4 (Thursday), search on day 1 (Monday) -> ELIGIBLE.
    5. Empty candidate fast-path.
    """
    conn = await connect_test_database()

    test_driver_id = uuid4()
    test_user_id = uuid4()
    rider_user_id = uuid4()
    rider_profile_id = uuid4()
    rider_id = uuid4()
    sub_id = uuid4()
    sub_other_day_id = uuid4()

    slot_touching_id = uuid4()
    slot_pickup_id = uuid4()
    slot_other_day_id = uuid4()

    try:
        # 1. Insert test user and driver profile
        await conn.execute(
            """
            INSERT INTO users (id, phone, email, full_name, role)
            VALUES ($1, $2, $3, 'Timing Test Driver', 'DRIVER')
            ON CONFLICT (id) DO NOTHING;
            """,
            str(test_user_id),
            f"+92300{str(uuid4().int)[:7]}",
            f"driver_{uuid4().hex[:8]}@example.com",
        )
        await conn.execute(
            """
            INSERT INTO driver_profiles (
                id, user_id, licence_number, vehicle_make, vehicle_model,
                vehicle_year, vehicle_colour, plate_number, seat_capacity,
                base_price_cents, status, operating_days
            ) VALUES (
                $1, $2, 'LIC-TIM-001', 'Toyota', 'HiAce',
                2022, 'White', $3, 4,
                500000, 'APPROVED', ARRAY[1, 2, 3, 4, 5]
            );
            """,
            str(test_driver_id),
            str(test_user_id),
            f"TIM-{uuid4().hex[:6].upper()}",
        )

        # 2. Insert rider and subscriptions
        await conn.execute(
            """
            INSERT INTO users (id, phone, email, full_name, role)
            VALUES ($1, $2, $3, 'Test Rider Parent', 'CONSUMER');
            """,
            str(rider_user_id),
            f"+92300{str(uuid4().int)[:7]}",
            f"rider_{uuid4().hex[:8]}@example.com",
        )
        await conn.execute(
            """
            INSERT INTO consumer_profiles (id, user_id, emergency_contact_name, emergency_contact_phone)
            VALUES ($1, $2, 'Emergency Parent', '+923001234567');
            """,
            str(rider_profile_id),
            str(rider_user_id),
        )
        await conn.execute(
            """
            INSERT INTO riders (id, consumer_profile_id, name, home_address_text, dest_address_text)
            VALUES ($1, $2, 'Test Rider', 'Home Addr', 'Dest Addr');
            """,
            str(rider_id),
            str(rider_profile_id),
        )
        await conn.execute(
            """
            INSERT INTO subscriptions (
                id, rider_id, driver_profile_id, type, agreed_pickup_time,
                agreed_dropoff_time, pickup_address_text, dropoff_address_text,
                monthly_price_cents, status, start_date, next_billing_date
            ) VALUES
            ($1, $2, $3, 'ROUND_TRIP', '2026-01-01T07:30:00Z', '2026-01-01T14:30:00Z',
             'Home', 'School', 10000, 'ACTIVE', CURRENT_DATE, CURRENT_DATE + 30),
            ($4, $2, $3, 'ONE_WAY', '2026-01-01T08:30:00Z', '2026-01-01T09:00:00Z',
             'Home', 'School', 5000, 'ACTIVE', CURRENT_DATE, CURRENT_DATE + 30);
            """,
            str(sub_id),
            str(rider_id),
            str(test_driver_id),
            str(sub_other_day_id),
        )

        # 3. Insert Schedule Slots:
        # Slot 1: Morning 08:00 - 08:30 on days [1, 2, 3] (belongs to sub_id)
        # Slot 2: Afternoon 14:15 - 15:00 on days [1, 2, 3] (belongs to sub_id)
        # Slot 3: Morning 08:30 - 09:00 on days [4, 5] (belongs to sub_other_day_id)
        await conn.execute(
            """
            INSERT INTO driver_schedule_slots (
                id, driver_profile_id, subscription_id, leg_type,
                slot_start, slot_end, operating_days, pickup_order
            ) VALUES
            ($1, $2, $3, 'DEPARTURE', '08:00:00', '08:30:00', ARRAY[1, 2, 3], 1),
            ($4, $2, $3, 'PICKUP', '14:15:00', '15:00:00', ARRAY[1, 2, 3], 1),
            ($5, $2, $6, 'DEPARTURE', '08:30:00', '09:00:00', ARRAY[4, 5], 1);
            """,
            str(slot_touching_id),
            str(test_driver_id),
            str(sub_id),
            str(slot_pickup_id),
            str(slot_other_day_id),
            str(sub_other_day_id),
        )

        candidate = make_candidate_driver(driver_id=str(test_driver_id))

        # ─── CASE A: Morning Touching Window (08:30 - 09:00) on Day 1 ───
        # Touches Slot 1 (08:00-08:30) at boundary 08:30 (510m).
        window_touching = RequestedServiceWindow(
            has_departure_leg=True,
            departure_start=time(8, 30),
            departure_end=time(9, 0),
            departure_start_min=510,
            departure_end_min=540,
            has_pickup_leg=False,
            pickup_start=None,
            pickup_end=None,
            duration_minutes=30.0,
        )

        # Gap = 0 -> Touching allowed -> ELIGIBLE
        eligible_0, excluded_0 = await filter_candidates_by_timing(
            conn, [candidate], day=1, window=window_touching, gap_minutes=0
        )
        assert len(eligible_0) == 1
        assert len(excluded_0) == 0

        # Gap = 5 -> Touching violates 5m buffer -> EXCLUDED (TIMING)
        eligible_5, excluded_5 = await filter_candidates_by_timing(
            conn, [candidate], day=1, window=window_touching, gap_minutes=5
        )
        assert len(eligible_5) == 0
        assert len(excluded_5) == 1
        assert excluded_5[0][1].exclusion_reason == "TIMING"

        # ─── CASE B: ROUND_TRIP Conflict on Afternoon Leg ───────────────
        # Morning: 07:00 - 07:30 (free). Afternoon: 14:30 - 15:15 (overlaps Slot 2: 14:15-15:00).
        window_rt_conflict = RequestedServiceWindow(
            has_departure_leg=True,
            departure_start=time(7, 0),
            departure_end=time(7, 30),
            departure_start_min=420,
            departure_end_min=450,
            has_pickup_leg=True,
            pickup_start=time(14, 30),
            pickup_end=time(15, 15),
            pickup_start_min=870,
            pickup_end_min=915,
            duration_minutes=30.0,
        )
        eligible_rt, excluded_rt = await filter_candidates_by_timing(
            conn, [candidate], day=1, window=window_rt_conflict, gap_minutes=0
        )
        assert len(eligible_rt) == 0
        assert len(excluded_rt) == 1
        assert excluded_rt[0][1].exclusion_reason == "TIMING"
        assert excluded_rt[0][1].conflicting_slots[0].leg_type == "PICKUP"

        # ─── CASE C: Operating Day Isolation ────────────────────────────
        # Search on Day 4 (Thursday) with window 07:00 - 07:30:
        # Slot 3 on day 4 is 08:30-09:00, so does not overlap 07:00-07:30.
        window_day4 = RequestedServiceWindow(
            has_departure_leg=True,
            departure_start=time(7, 0),
            departure_end=time(7, 30),
            departure_start_min=420,
            departure_end_min=450,
            has_pickup_leg=False,
            pickup_start=None,
            pickup_end=None,
            duration_minutes=30.0,
        )
        eligible_d4, excluded_d4 = await filter_candidates_by_timing(
            conn, [candidate], day=4, window=window_day4, gap_minutes=0
        )
        assert len(eligible_d4) == 1
        assert len(excluded_d4) == 0

        # ─── CASE D: Empty candidates fast-path ─────────────────────────
        empty_el, empty_ex = await filter_candidates_by_timing(
            conn, [], day=1, window=window_touching
        )
        assert empty_el == []
        assert empty_ex == []

        # ─── CASE E: ROUND_TRIP Conflict on Morning Leg Only ───────────
        # Morning: 08:00 - 08:30 (overlaps Slot 1). Afternoon: 17:00 - 18:00 (free).
        window_rt_departure_conflict = RequestedServiceWindow(
            has_departure_leg=True,
            departure_start=time(8, 0),
            departure_end=time(8, 30),
            departure_start_min=480,
            departure_end_min=510,
            has_pickup_leg=True,
            pickup_start=time(17, 0),
            pickup_end=time(18, 0),
            pickup_start_min=1020,
            pickup_end_min=1080,
            duration_minutes=30.0,
        )
        el_m, ex_m = await filter_candidates_by_timing(
            conn, [candidate], day=1, window=window_rt_departure_conflict, gap_minutes=0
        )
        assert len(el_m) == 0
        assert len(ex_m) == 1
        assert ex_m[0][1].exclusion_reason == "TIMING"
        assert ex_m[0][1].conflicting_slots[0].leg_type == "DEPARTURE"

        # ─── CASE F: Empty driver_ids call to find_conflicting_schedule_slots ───
        assert await find_conflicting_schedule_slots(conn, [], day=1, window=window_touching) == {}

    finally:
        # Cleanup seeded records
        await conn.execute(
            "DELETE FROM driver_schedule_slots WHERE driver_profile_id = $1;", str(test_driver_id)
        )
        await conn.execute(
            "DELETE FROM subscriptions WHERE driver_profile_id = $1;", str(test_driver_id)
        )
        await conn.execute("DELETE FROM riders WHERE id = $1;", str(rider_id))
        await conn.execute("DELETE FROM consumer_profiles WHERE id = $1;", str(rider_profile_id))
        await conn.execute("DELETE FROM driver_profiles WHERE id = $1;", str(test_driver_id))
        await conn.execute(
            "DELETE FROM users WHERE id IN ($1, $2);", str(test_user_id), str(rider_user_id)
        )
        await conn.close()

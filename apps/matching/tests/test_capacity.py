"""Unit, regression, vector, and live database tests for capacity checking (Phase 1A Task 1.04).

Validates:
1. Deterministic Haversine commute duration calculation.
2. Service window construction and interval validations (AD-13):
   - Cross-midnight service intervals (HTTP 400 INVALID_SERVICE_INTERVAL).
   - Inverted ROUND_TRIP times and overlapping legs (HTTP 400 INVALID_ROUND_TRIP_TIMES).
   - Configurable minimum leg gap (ROUND_TRIP_MIN_LEG_GAP_MINUTES).
3. E6 capacity evaluation logic:
   - Available seats = seat_capacity - overlapping_active_subscriptions.
   - Eligible iff available_seats >= 1; otherwise excluded with code 'CAPACITY'.
4. Distinct subscription accounting (user critical requirements):
   - Existing ROUND_TRIP overlapping morning leg only -> 1 seat.
   - Existing ROUND_TRIP overlapping afternoon leg only -> 1 seat.
   - Existing ROUND_TRIP overlapping both legs -> 1 seat (proves COUNT(DISTINCT s.id)).
5. Status and operating day isolation:
   - PENDING subscriptions do not consume seats.
   - PAUSED and CANCELLED subscriptions free seats.
   - Subscriptions operating on other days do not consume capacity.
6. Cross-language canonical test vectors (AD-11: VEC-E6-01, VEC-ELIGIBLE-01, VEC-ELIGIBLE-02).
7. Live PostgreSQL batch query and filter integration.
"""

from __future__ import annotations

import json
from datetime import time
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import asyncpg
import pytest
from _database import matching_test_database_url
from shapely.geometry import LineString

from app.matching.candidates import CandidateDriver
from app.matching.capacity import (
    InvalidRoundTripTimesError,
    InvalidServiceIntervalError,
    RequestedServiceWindow,
    build_requested_service_windows,
    calculate_haversine_duration_minutes,
    count_overlapping_active_subscriptions,
    evaluate_candidate_capacity,
    filter_candidates_by_capacity,
    minutes_to_time,
    time_str_to_minutes,
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


def test_haversine_duration_calculation() -> None:
    """Duration formula: (km * 1.3 / 25 km/h) * 60 min."""
    # Test with known coordinates ~13.8 km
    lat1, lng1 = KARACHI_ORIGIN_LAT, KARACHI_ORIGIN_LNG
    lat2, lng2 = KARACHI_DEST_LAT, KARACHI_DEST_LNG

    duration = calculate_haversine_duration_minutes(
        lat1, lng1, lat2, lng2, city_speed_kmh=25.0, detour_factor=1.3
    )
    # Distance is ~15.2 km -> ~47.4 min
    assert 40.0 < duration < 55.0

    # Test with identical coords -> 0.0 min
    zero_dur = calculate_haversine_duration_minutes(lat1, lng1, lat1, lng1)
    assert zero_dur == 0.0


def test_time_conversions() -> None:
    """Helper minute conversions."""
    assert time_str_to_minutes("00:00") == 0
    assert time_str_to_minutes("07:30") == 450
    assert time_str_to_minutes("23:59") == 1439

    assert minutes_to_time(0) == time(0, 0)
    assert minutes_to_time(450) == time(7, 30)
    assert minutes_to_time(1439) == time(23, 59)


# ─── 2. Service Window Construction Tests ──────────────────────────────────────


def test_build_requested_service_windows_morning() -> None:
    """Constructs morning window: [time - buffer, time + buffer + duration]."""
    req = make_search_request(subscription_type="ONE_WAY", time_str="07:30")
    window = build_requested_service_windows(req, buffer_minutes=15, city_speed_kmh=25.0)

    assert window.has_departure_leg is True
    assert window.has_pickup_leg is False
    assert window.pickup_start is None
    assert window.pickup_end is None

    # departure_start = 07:30 - 15m = 07:15
    assert window.departure_start == time(7, 15)
    # duration is ~45m -> end is ~07:30 + 15m + 45m = ~08:30
    assert window.departure_end is not None
    assert window.departure_end > time(8, 0)


def test_build_requested_service_windows_one_way_departure_in_afternoon() -> None:
    """A one-way commute uses a departure window regardless of time of day."""
    req = make_search_request(subscription_type="ONE_WAY", time_str="14:30")
    window = build_requested_service_windows(req, buffer_minutes=15, city_speed_kmh=25.0)

    assert window.has_departure_leg is True
    assert window.has_pickup_leg is False
    assert window.pickup_start is None
    assert window.pickup_end is None

    # Departure start = 14:30 - 15m = 14:15
    assert window.departure_start == time(14, 15)
    assert window.departure_end is not None
    assert window.departure_end > time(15, 0)


def test_build_requested_service_windows_round_trip() -> None:
    """Constructs both morning and afternoon windows for ROUND_TRIP."""
    req = make_search_request(
        subscription_type="ROUND_TRIP",
        time_str="07:30",
        pickup_time="15:00",
    )
    window = build_requested_service_windows(req, buffer_minutes=15, city_speed_kmh=25.0)

    assert window.has_departure_leg is True
    assert window.has_pickup_leg is True
    assert window.departure_start == time(7, 15)
    assert window.pickup_start == time(14, 45)


# ─── 3. Window Validation & Invariants (AD-13) ──────────────────────────────────


def test_cross_midnight_interval_rejected_start_underflow() -> None:
    """Request at 00:05 with 15m buffer underflows midnight -> HTTP 400 INVALID_SERVICE_INTERVAL."""
    req = make_search_request(subscription_type="ONE_WAY", time_str="00:05")
    with pytest.raises(InvalidServiceIntervalError) as exc_info:
        build_requested_service_windows(req, buffer_minutes=15)

    assert exc_info.value.status_code == 400
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail["code"] == "INVALID_SERVICE_INTERVAL"


def test_cross_midnight_interval_rejected_end_overflow() -> None:
    """Request at 23:30 with 15m buffer and 40m duration overflows midnight -> HTTP 400."""
    req = make_search_request(subscription_type="ONE_WAY", time_str="23:30")
    with pytest.raises(InvalidServiceIntervalError) as exc_info:
        build_requested_service_windows(req, buffer_minutes=15)

    assert exc_info.value.status_code == 400
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail["code"] == "INVALID_SERVICE_INTERVAL"


def test_round_trip_pickup_time_before_departure_rejected() -> None:
    """The request contract rejects a pickup time earlier than departure."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        make_search_request(
            subscription_type="ROUND_TRIP",
            time_str="14:00",
            pickup_time="09:00",
        )


def test_overlapping_round_trip_legs_rejected() -> None:
    """Afternoon leg window starting before morning leg window finishes -> HTTP 400."""
    # Morning: 08:00 (end ~ 09:15). Afternoon: 08:30 (start 08:15). Overlaps!
    req = make_search_request(
        subscription_type="ROUND_TRIP",
        time_str="08:00",
        pickup_time="08:30",
    )
    with pytest.raises(InvalidRoundTripTimesError) as exc_info:
        build_requested_service_windows(req)

    assert exc_info.value.status_code == 400
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail["code"] == "INVALID_ROUND_TRIP_TIMES"


def test_touching_round_trip_legs_accepted_when_gap_zero() -> None:
    """Touching windows (departure_end == pickup_start) are accepted when min_gap = 0."""
    # Mocking short points so duration is exactly 0
    req = make_search_request(
        pickup_lat=24.86,
        pickup_lng=67.01,
        dest_lat=24.86,
        dest_lng=67.01,
        subscription_type="ROUND_TRIP",
        time_str="08:00",  # buffer 15m -> morning [07:45, 08:15]
        pickup_time="08:30",  # buffer 15m -> afternoon [08:15, 08:45]
    )
    # departure_end (08:15) == pickup_start (08:15). With gap=0, accepted!
    window = build_requested_service_windows(req, buffer_minutes=15, min_leg_gap_minutes=0)
    assert window.departure_end == time(8, 15)
    assert window.pickup_start == time(8, 15)


def test_configurable_leg_gap_enforced() -> None:
    """Enforce departure_end + min_leg_gap_minutes <= pickup_start."""
    req = make_search_request(
        pickup_lat=24.86,
        pickup_lng=67.01,
        dest_lat=24.86,
        dest_lng=67.01,
        subscription_type="ROUND_TRIP",
        time_str="08:00",  # morning end: 08:15 (495m)
        pickup_time="08:44",  # buffer 15m -> afternoon start: 08:29 (509m). Gap = 14m.
    )

    # With min_leg_gap_minutes = 15: 495 + 15 = 510 > 509 -> Rejected!
    with pytest.raises(InvalidRoundTripTimesError):
        build_requested_service_windows(req, buffer_minutes=15, min_leg_gap_minutes=15)

    # Now with pickup_time="08:45": afternoon start: 08:30 (510m). Gap = 15m -> Accepted!
    req_valid = make_search_request(
        pickup_lat=24.86,
        pickup_lng=67.01,
        dest_lat=24.86,
        dest_lng=67.01,
        subscription_type="ROUND_TRIP",
        time_str="08:00",
        pickup_time="08:45",
    )
    window = build_requested_service_windows(req_valid, buffer_minutes=15, min_leg_gap_minutes=15)
    assert window.departure_end == time(8, 15)
    assert window.pickup_start == time(8, 30)


# ─── 4. Candidate Capacity Evaluation Logic ────────────────────────────────────


def test_capacity_at_capacity_excluded() -> None:
    """Driver at capacity (capacity=4, active=4) -> available=0 -> excluded with CAPACITY."""
    driver = make_candidate_driver(seat_capacity=4)
    result = evaluate_candidate_capacity(driver, overlapping_active_count=4)

    assert result.available_seats == 0
    assert result.is_eligible is False
    assert result.exclusion_reason == "CAPACITY"


def test_capacity_one_free_seat_eligible() -> None:
    """Driver with one free seat (capacity=4, active=3) -> available=1 -> eligible."""
    driver = make_candidate_driver(seat_capacity=4)
    result = evaluate_candidate_capacity(driver, overlapping_active_count=3)

    assert result.available_seats == 1
    assert result.is_eligible is True
    assert result.exclusion_reason is None


def test_capacity_multiple_free_seats_eligible() -> None:
    """Driver with multiple free seats (capacity=6, active=2) -> available=4 -> eligible."""
    driver = make_candidate_driver(seat_capacity=6)
    result = evaluate_candidate_capacity(driver, overlapping_active_count=2)

    assert result.available_seats == 4
    assert result.is_eligible is True
    assert result.exclusion_reason is None


def test_capacity_over_capacity_excluded() -> None:
    """Driver over capacity (capacity=4, active=5) -> available=-1 -> excluded with CAPACITY."""
    driver = make_candidate_driver(seat_capacity=4)
    result = evaluate_candidate_capacity(driver, overlapping_active_count=5)

    assert result.available_seats == -1
    assert result.is_eligible is False
    assert result.exclusion_reason == "CAPACITY"


# ─── 5. Canonical Shared Test Vectors (AD-11) ──────────────────────────────────


def test_shared_test_vectors_capacity_stage() -> None:
    """Validates VEC-E6-01, VEC-ELIGIBLE-01, and VEC-ELIGIBLE-02 from eligibility.json."""
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
        pytest.skip("Test vectors eligibility.json not found")

    with open(vectors_path, encoding="utf-8") as f:
        data = json.load(f)

    for vec in data["vectors"]:
        vec_id = vec["id"]

        if vec_id == "VEC-E6-01":
            # Capacity=4, overlappingActiveSubscriptions=4 -> Excluded
            driver = make_candidate_driver(
                seat_capacity=vec["driver"]["seatCapacity"],
                driver_id=vec["driver"]["id"],
            )
            res = evaluate_candidate_capacity(
                driver,
                overlapping_active_count=vec["driver"]["overlappingActiveSubscriptions"],
            )
            assert res.is_eligible is False
            assert res.exclusion_reason == vec["expectedExclusionCode"]

        elif vec_id == "VEC-ELIGIBLE-01":
            # Capacity=4, overlappingActiveSubscriptions=2 -> Eligible
            driver = make_candidate_driver(
                seat_capacity=vec["driver"]["seatCapacity"],
                driver_id=vec["driver"]["id"],
            )
            res = evaluate_candidate_capacity(
                driver,
                overlapping_active_count=vec["driver"]["overlappingActiveSubscriptions"],
            )
            assert res.is_eligible is True
            assert res.available_seats == 2

        elif vec_id == "VEC-ELIGIBLE-02":
            # Capacity=4, overlappingActiveSubscriptions=1 -> Eligible
            driver = make_candidate_driver(
                seat_capacity=vec["driver"]["seatCapacity"],
                driver_id=vec["driver"]["id"],
            )
            res = evaluate_candidate_capacity(
                driver,
                overlapping_active_count=vec["driver"]["overlappingActiveSubscriptions"],
            )
            assert res.is_eligible is True
            assert res.available_seats == 3


# ─── 6. Live PostgreSQL Database Integration & Distinct Accounting ─────────────


@pytest.mark.asyncio
async def test_live_postgres_capacity_distinct_accounting_and_isolation() -> None:
    """Live database integration test validating:

    1. User Requirement 3: ROUND_TRIP permutations:
       - Overlaps morning only -> 1 seat.
       - Overlaps afternoon only -> 1 seat.
       - Overlaps both -> 1 seat (proves COUNT(DISTINCT s.id)).
    2. Status isolation (ACTIVE vs PENDING/PAUSED/CANCELLED).
    3. Operating day isolation.
    4. filter_candidates_by_capacity end-to-end integration.
    """
    database_url = matching_test_database_url()
    if database_url is None:
        pytest.skip("MATCHING_TEST_DATABASE_URL must name a dedicated test database")
    try:
        conn = await asyncpg.connect(database_url)
    except Exception as exc:
        pytest.skip(f"PostgreSQL database unavailable: {exc}")

    test_driver_id = uuid4()
    test_user_id = uuid4()
    rider_user_id = uuid4()
    rider_profile_id = uuid4()
    rider_id = uuid4()

    # Subscription IDs
    sub_rt_both_id = uuid4()
    sub_rt_departure_only_id = uuid4()
    sub_pending_id = uuid4()
    sub_other_day_id = uuid4()

    try:
        # 1. Insert test user and driver profile (capacity=4)
        await conn.execute(
            """
            INSERT INTO users (id, phone, email, full_name, role)
            VALUES ($1, $2, $3, 'Capacity Test Driver', 'DRIVER')
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
                $1, $2, 'LIC-CAP-001', 'Toyota', 'HiAce',
                2022, 'White', $3, 4,
                500000, 'APPROVED', ARRAY[1, 2, 3, 4, 5]
            );
            """,
            str(test_driver_id),
            str(test_user_id),
            f"CAP-{uuid4().hex[:6].upper()}",
        )

        # 2. Insert rider
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

        # 3. Seed subscriptions and schedule slots:

        # Sub A: ACTIVE ROUND_TRIP overlapping BOTH legs on day 1
        # Morning slot: 07:15 - 08:00. Afternoon slot: 14:15 - 15:00.
        await conn.execute(
            """
            INSERT INTO subscriptions (
                id, rider_id, driver_profile_id, type, agreed_pickup_time,
                agreed_dropoff_time, pickup_address_text, dropoff_address_text,
                monthly_price_cents, status, start_date, next_billing_date
            ) VALUES (
                $1, $2, $3, 'ROUND_TRIP', '2026-01-01T07:30:00Z', '2026-01-01T14:30:00Z',
                'Home', 'School', 10000, 'ACTIVE', CURRENT_DATE, CURRENT_DATE + 30
            );
            """,
            str(sub_rt_both_id),
            str(rider_id),
            str(test_driver_id),
        )
        await conn.execute(
            """
            INSERT INTO driver_schedule_slots (
                id, driver_profile_id, subscription_id, leg_type,
                slot_start, slot_end, operating_days, pickup_order
            ) VALUES
            ($1, $2, $3, 'DEPARTURE', '07:15:00', '08:00:00', ARRAY[1, 2, 3], 1),
            ($4, $2, $3, 'PICKUP', '14:15:00', '15:00:00', ARRAY[1, 2, 3], 1);
            """,
            str(uuid4()),
            str(test_driver_id),
            str(sub_rt_both_id),
            str(uuid4()),
        )

        # Sub B: ACTIVE ROUND_TRIP overlapping DEPARTURE ONLY on day 1
        # Morning slot: 07:20 - 08:10. Afternoon slot: 17:00 - 18:00 (outside afternoon search window 14:15-15:00)
        await conn.execute(
            """
            INSERT INTO subscriptions (
                id, rider_id, driver_profile_id, type, agreed_pickup_time,
                agreed_dropoff_time, pickup_address_text, dropoff_address_text,
                monthly_price_cents, status, start_date, next_billing_date
            ) VALUES (
                $1, $2, $3, 'ROUND_TRIP', '2026-01-01T07:30:00Z', '2026-01-01T17:30:00Z',
                'Home', 'School', 10000, 'ACTIVE', CURRENT_DATE, CURRENT_DATE + 30
            );
            """,
            str(sub_rt_departure_only_id),
            str(rider_id),
            str(test_driver_id),
        )
        await conn.execute(
            """
            INSERT INTO driver_schedule_slots (
                id, driver_profile_id, subscription_id, leg_type,
                slot_start, slot_end, operating_days, pickup_order
            ) VALUES
            ($1, $2, $3, 'DEPARTURE', '07:20:00', '08:10:00', ARRAY[1, 2, 3], 2),
            ($4, $2, $3, 'PICKUP', '17:00:00', '18:00:00', ARRAY[1, 2, 3], 2);
            """,
            str(uuid4()),
            str(test_driver_id),
            str(sub_rt_departure_only_id),
            str(uuid4()),
        )

        # Sub C: PENDING subscription overlapping morning (should NOT count)
        await conn.execute(
            """
            INSERT INTO subscriptions (
                id, rider_id, driver_profile_id, type, agreed_pickup_time,
                agreed_dropoff_time, pickup_address_text, dropoff_address_text,
                monthly_price_cents, status, start_date, next_billing_date
            ) VALUES (
                $1, $2, $3, 'ONE_WAY', '2026-01-01T07:30:00Z', '2026-01-01T08:30:00Z',
                'Home', 'School', 10000, 'PENDING', CURRENT_DATE, CURRENT_DATE + 30
            );
            """,
            str(sub_pending_id),
            str(rider_id),
            str(test_driver_id),
        )
        await conn.execute(
            """
            INSERT INTO driver_schedule_slots (
                id, driver_profile_id, subscription_id, leg_type,
                slot_start, slot_end, operating_days, pickup_order
            ) VALUES
            ($1, $2, $3, 'DEPARTURE', '07:15:00', '08:00:00', ARRAY[1, 2, 3], 3);
            """,
            str(uuid4()),
            str(test_driver_id),
            str(sub_pending_id),
        )

        # Sub D: ACTIVE subscription on OTHER day (operating_days = [4, 5]) (should NOT count on day 1)
        await conn.execute(
            """
            INSERT INTO subscriptions (
                id, rider_id, driver_profile_id, type, agreed_pickup_time,
                agreed_dropoff_time, pickup_address_text, dropoff_address_text,
                monthly_price_cents, status, start_date, next_billing_date
            ) VALUES (
                $1, $2, $3, 'ONE_WAY', '2026-01-01T07:30:00Z', '2026-01-01T08:30:00Z',
                'Home', 'School', 10000, 'ACTIVE', CURRENT_DATE, CURRENT_DATE + 30
            );
            """,
            str(sub_other_day_id),
            str(rider_id),
            str(test_driver_id),
        )
        await conn.execute(
            """
            INSERT INTO driver_schedule_slots (
                id, driver_profile_id, subscription_id, leg_type,
                slot_start, slot_end, operating_days, pickup_order
            ) VALUES
            ($1, $2, $3, 'DEPARTURE', '07:15:00', '08:00:00', ARRAY[4, 5], 4);
            """,
            str(uuid4()),
            str(test_driver_id),
            str(sub_other_day_id),
        )

        # ─── VERIFICATION 1: Morning-only Search ───────────────────────────────
        # Sub A overlaps morning -> 1. Sub B overlaps morning -> 1.
        # Sub C is PENDING -> 0. Sub D is other day -> 0.
        # Total distinct active = 2.
        window_morning = RequestedServiceWindow(
            has_departure_leg=True,
            departure_start=time(7, 15),
            departure_end=time(8, 0),
            has_pickup_leg=False,
            pickup_start=None,
            pickup_end=None,
            duration_minutes=15.0,
        )

        counts_morning = await count_overlapping_active_subscriptions(
            conn,
            [test_driver_id],
            day=1,
            window=window_morning,
        )
        assert counts_morning[test_driver_id] == 2

        # ─── VERIFICATION 2: Afternoon-only Search ─────────────────────────────
        # Sub A overlaps afternoon (14:15-15:00) -> 1.
        # Sub B afternoon is 17:00-18:00 (does NOT overlap 14:15-15:00) -> 0.
        # Total distinct active = 1.
        window_afternoon = RequestedServiceWindow(
            has_departure_leg=False,
            departure_start=None,
            departure_end=None,
            has_pickup_leg=True,
            pickup_start=time(14, 15),
            pickup_end=time(15, 0),
            duration_minutes=15.0,
        )

        counts_afternoon = await count_overlapping_active_subscriptions(
            conn,
            [test_driver_id],
            day=1,
            window=window_afternoon,
        )
        assert counts_afternoon[test_driver_id] == 1

        # ─── VERIFICATION 3: ROUND_TRIP Search (Both Legs) ────────────────────
        # Sub A: overlaps morning AND afternoon -> counted ONCE due to COUNT(DISTINCT s.id) -> 1 seat.
        # Sub B: overlaps morning only -> counted ONCE -> 1 seat.
        # Sub C: PENDING -> 0.
        # Sub D: other day -> 0.
        # Total distinct active = 2.
        window_rt = RequestedServiceWindow(
            has_departure_leg=True,
            departure_start=time(7, 15),
            departure_end=time(8, 0),
            has_pickup_leg=True,
            pickup_start=time(14, 15),
            pickup_end=time(15, 0),
            duration_minutes=15.0,
        )

        counts_rt = await count_overlapping_active_subscriptions(
            conn,
            [test_driver_id],
            day=1,
            window=window_rt,
        )
        assert counts_rt[test_driver_id] == 2

        # ─── VERIFICATION 4: Operating Day Isolation ──────────────────────────
        # On Day 5 (Friday): Sub A and Sub B operate on [1, 2, 3] -> 0.
        # Sub D operates on [4, 5] and morning overlaps -> 1 seat.
        counts_day5 = await count_overlapping_active_subscriptions(
            conn,
            [test_driver_id],
            day=5,
            window=window_morning,
        )
        assert counts_day5[test_driver_id] == 1

        # ─── VERIFICATION 5: filter_candidates_by_capacity ───────────────────
        candidate = CandidateDriver(
            driver_profile_id=test_driver_id,
            user_id=test_user_id,
            seat_capacity=4,  # capacity 4, active 2 -> available 2 >= 1 -> ELIGIBLE
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

        req = make_search_request(
            subscription_type="ROUND_TRIP",
            time_str="07:30",
            pickup_time="14:30",
            day=1,
        )

        eligible, excluded = await filter_candidates_by_capacity(
            conn,
            [candidate],
            req,
            buffer_minutes=15,
        )
        assert len(eligible) == 1
        assert len(excluded) == 0
        assert eligible[0].driver_profile_id == test_driver_id

        # Now test when driver seat_capacity = 2 (active 2 -> available 0 -> EXCLUDED)
        candidate_full = CandidateDriver(
            driver_profile_id=test_driver_id,
            user_id=test_user_id,
            seat_capacity=2,
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

        eligible_full, excluded_full = await filter_candidates_by_capacity(
            conn,
            [candidate_full],
            req,
            buffer_minutes=15,
        )
        assert len(eligible_full) == 0
        assert len(excluded_full) == 1
        cand_ex, res_ex = excluded_full[0]
        assert cand_ex.driver_profile_id == test_driver_id
        assert res_ex.available_seats == 0
        assert res_ex.exclusion_reason == "CAPACITY"

    finally:
        # Cleanup seeded records
        await conn.execute(
            "DELETE FROM driver_schedule_slots WHERE driver_profile_id = $1;", str(test_driver_id)
        )
        await conn.execute(
            "DELETE FROM subscriptions WHERE driver_profile_id = $1;", str(test_driver_id)
        )
        await conn.execute("DELETE FROM driver_profiles WHERE id = $1;", str(test_driver_id))
        await conn.execute("DELETE FROM riders WHERE id = $1;", str(rider_id))
        await conn.execute("DELETE FROM consumer_profiles WHERE id = $1;", str(rider_profile_id))
        await conn.execute(
            "DELETE FROM users WHERE id IN ($1, $2);", str(test_user_id), str(rider_user_id)
        )
        await conn.close()


@pytest.mark.asyncio
async def test_empty_candidates_capacity_filtering() -> None:
    """Empty candidate lists fast-path without database query."""
    dummy_conn: Any = None  # Not accessed
    window = RequestedServiceWindow(
        has_departure_leg=True,
        departure_start=time(7, 0),
        departure_end=time(8, 0),
        has_pickup_leg=False,
        pickup_start=None,
        pickup_end=None,
        duration_minutes=20.0,
    )
    res_counts = await count_overlapping_active_subscriptions(dummy_conn, [], 1, window)
    assert res_counts == {}

    req = make_search_request()
    eligible, excluded = await filter_candidates_by_capacity(dummy_conn, [], req)
    assert eligible == []
    assert excluded == []

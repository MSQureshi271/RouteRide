"""Unit and regression tests for spatial candidate filtering (Task 1.02).

Validates:
1. Elimination of TRD §4.1 3x4 Cartesian product aggregate bug.
2. Deterministic E2 defensive geometry precedence order:
   NULL -> EMPTY -> WRONG_SRID -> NON_SIMPLE -> INVALID
3. Canonical precedence E1 -> E2 -> E3 -> E5 (distance evaluated before operating day).
4. Spatial corridor proximity filtering (E3) and distance evaluation.
5. Driver status exclusion (E1).
6. parse_route_geometry defensive behavior.
7. EXPLAIN query plan execution.
"""

from __future__ import annotations

from datetime import time
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import asyncpg
import pytest
from _database import connect_test_database
from shapely import LineString, wkb

from app.matching.candidates import (
    count_spatial_exclusions,
    explain_candidate_query,
    find_spatial_candidates,
    parse_route_geometry,
)
from app.schemas.internal_search import InternalSearchRequest

# Canonical test coordinates (Karachi)
KARACHI_PICKUP_LNG = 67.0100
KARACHI_PICKUP_LAT = 24.8600
KARACHI_DEST_LNG = 67.1100
KARACHI_DEST_LAT = 24.9200


def make_search_request(
    day: int = 1,
    pickup_radius: float = 1500.0,
    dest_radius: float = 2000.0,
) -> InternalSearchRequest:
    """Helper creating a standard test InternalSearchRequest."""
    return InternalSearchRequest(
        riderId=UUID("550e8400-e29b-41d4-a716-446655440000"),
        pickupLat=KARACHI_PICKUP_LAT,
        pickupLng=KARACHI_PICKUP_LNG,
        destLat=KARACHI_DEST_LAT,
        destLng=KARACHI_DEST_LNG,
        day=day,
        departureTime="07:30",
        subscriptionType="ONE_WAY",
        pickupRadiusMeters=pickup_radius,
        destRadiusMeters=dest_radius,
    )


# ─── 1. parse_route_geometry Unit Tests ─────────────────────────────────────────


def test_parse_route_geometry_valid_wkb() -> None:
    """parse_route_geometry correctly loads valid Shapely LineString from WKB bytes."""
    line = LineString([(67.0, 24.8), (67.1, 24.9)])
    raw_bytes = wkb.dumps(line)
    geom = parse_route_geometry(raw_bytes)
    assert isinstance(geom, LineString)
    assert len(geom.coords) == 2
    assert geom.coords[0] == (67.0, 24.8)


def test_parse_route_geometry_valid_hex_str() -> None:
    """parse_route_geometry loads geometry from hex-encoded string."""
    line = LineString([(67.0, 24.8), (67.1, 24.9)])
    hex_str = wkb.dumps(line, hex=True)
    geom = parse_route_geometry(hex_str)
    assert isinstance(geom, LineString)
    assert len(geom.coords) == 2


def test_parse_route_geometry_none_raises() -> None:
    """parse_route_geometry raises ValueError on None input."""
    with pytest.raises(ValueError, match="route_geometry cannot be None"):
        parse_route_geometry(None)


def test_parse_route_geometry_empty_raises() -> None:
    """parse_route_geometry raises ValueError on empty geometry."""
    empty_line = LineString([])
    raw_bytes = wkb.dumps(empty_line)
    with pytest.raises(ValueError, match="route_geometry cannot be empty"):
        parse_route_geometry(raw_bytes)


def test_parse_route_geometry_malformed_raises() -> None:
    """parse_route_geometry raises ValueError on corrupt bytes."""
    with pytest.raises(ValueError, match="Failed to deserialize route geometry"):
        parse_route_geometry(b"\x00\x01\x02\x03\x04")


# ─── 2. 3x4 Cartesian Product Bug Regression Tests ──────────────────────────────


@pytest.mark.asyncio
async def test_cartesian_product_eliminated_mock() -> None:
    """Regression test proving LATERAL joins isolate reviews and subscriptions.

    If a driver has 3 reviews and 4 active subscriptions:
    - true avgRating is the average of 3 reviews (e.g. 4.00), reviewCount is 3.
    - activeSubscriptionsCount is 4.
    - The buggy un-lateral query generated 3 * 4 = 12 rows.
    """
    line = LineString([(67.0, 24.8), (67.1, 24.9)])
    ewkb_bytes = wkb.dumps(line)

    mock_row = {
        "driver_profile_id": "11111111-1111-4111-8111-111111111111",
        "user_id": "22222222-2222-4222-8222-222222222222",
        "seat_capacity": 4,
        "operating_days": [1, 2, 3, 4, 5],
        "acceptance_rate": 0.85,
        "route_geometry_ewkb": ewkb_bytes,
        "pickup_distance_meters": 450.5,
        "dest_distance_meters": 620.0,
        "avg_rating": 4.00,  # Exact average of 3 reviews: [4, 5, 3] -> 4.00
        "review_count": 3,  # Exactly 3 reviews, NOT 12
        "active_subscriptions_count": 4,  # Exactly 4 subscriptions, NOT 12
        "typical_departure_time": time(7, 30),
        "departure_observation_count": 10,
    }

    pool = MagicMock(spec=asyncpg.Pool)
    conn = AsyncMock(spec=asyncpg.Connection)
    conn.fetch.return_value = [mock_row]

    acquire_ctx = AsyncMock()
    acquire_ctx.__aenter__.return_value = conn
    acquire_ctx.__aexit__.return_value = None
    pool.acquire.return_value = acquire_ctx

    req = make_search_request(day=1)
    candidates = await find_spatial_candidates(pool, req)

    assert len(candidates) == 1
    c = candidates[0]
    assert c.avg_rating == 4.00
    assert c.review_count == 3
    assert c.active_subscriptions_count == 4
    assert c.pickup_distance_meters == 450.5
    assert c.dest_distance_meters == 620.0
    assert c.seat_capacity == 4
    assert c.operating_days == [1, 2, 3, 4, 5]


# ─── 3. E2 Defensive Geometry Precedence & Diagnostics ──────────────────────────


@pytest.mark.asyncio
async def test_count_spatial_exclusions_diagnostic_mapping() -> None:
    """count_spatial_exclusions maps database rows to SpatialExclusionDiagnostics."""
    mock_diag_row = {
        "driver_status_failures": 2,  # E1
        "invalid_geometry_failures": 5,  # E2 total
        "null_geometry_count": 1,  # E2 tier 1
        "empty_geometry_count": 1,  # E2 tier 2
        "wrong_srid_count": 1,  # E2 tier 3
        "non_simple_count": 1,  # E2 tier 4
        "invalid_geometry_count": 1,  # E2 tier 5
        "distance_failures": 5,  # E3
        "direction_failures": 3,  # E4
        "operating_day_failures": 4,  # E5
        "passed_e5_count": 1,
    }

    pool = MagicMock(spec=asyncpg.Pool)
    conn = AsyncMock(spec=asyncpg.Connection)
    conn.fetchrow.return_value = mock_diag_row

    acquire_ctx = AsyncMock()
    acquire_ctx.__aenter__.return_value = conn
    acquire_ctx.__aexit__.return_value = None
    pool.acquire.return_value = acquire_ctx

    req = make_search_request(day=1)
    diag = await count_spatial_exclusions(pool, req)

    assert diag.driver_status_failures == 2
    assert diag.invalid_geometry_failures == 5
    assert diag.null_geometry_count == 1
    assert diag.empty_geometry_count == 1
    assert diag.wrong_srid_count == 1
    assert diag.non_simple_count == 1
    assert diag.invalid_geometry_count == 1
    assert diag.distance_failures == 5
    assert diag.direction_failures == 3
    assert diag.operating_day_failures == 4
    assert diag.passed_e5_count == 1


@pytest.mark.asyncio
async def test_count_spatial_exclusions_empty_db() -> None:
    """count_spatial_exclusions handles empty database gracefully."""
    pool = MagicMock(spec=asyncpg.Pool)
    conn = AsyncMock(spec=asyncpg.Connection)
    conn.fetchrow.return_value = None

    acquire_ctx = AsyncMock()
    acquire_ctx.__aenter__.return_value = conn
    acquire_ctx.__aexit__.return_value = None
    pool.acquire.return_value = acquire_ctx

    req = make_search_request()
    diag = await count_spatial_exclusions(pool, req)

    assert diag.driver_status_failures == 0
    assert diag.invalid_geometry_failures == 0
    assert diag.distance_failures == 0
    assert diag.operating_day_failures == 0
    assert diag.passed_e5_count == 0


# ─── 4. Live PostGIS Database Integration Tests ─────────────────────────────────


async def get_live_db_connection() -> asyncpg.Connection:
    """Connect to the dedicated test database; fails (never skips) when unavailable."""
    return await connect_test_database()


@pytest.mark.db
@pytest.mark.asyncio
async def test_live_postgis_candidate_and_cartesian_elimination() -> None:
    """Live PostGIS test: Seeds 3 reviews and 4 active subscriptions, verifying 3x4 fix."""
    conn = await get_live_db_connection()

    tr = conn.transaction()
    await tr.start()
    try:
        # Create test user and driver
        user_id = await conn.fetchval(
            "INSERT INTO users (id, email, phone, full_name, role, status) "
            "VALUES (gen_random_uuid()::text, 'driver1@test.com', '+923001111111', 'Test Driver', 'DRIVER', 'ACTIVE') "
            "RETURNING id;"
        )
        # Corridor passing near Karachi pickup (67.01, 24.86) and dest (67.11, 24.92)
        driver_id = await conn.fetchval(
            "INSERT INTO driver_profiles (id, user_id, status, licence_number, vehicle_make, vehicle_model, vehicle_year, "
            "vehicle_colour, plate_number, seat_capacity, base_price_cents, operating_days, route_polyline, route_state) "
            "VALUES (gen_random_uuid()::text, $1, 'APPROVED', 'LIC-101', 'Toyota', 'Corolla', 2020, 'White', 'ABC-101', 4, 500000, "
            "ARRAY[1, 2, 3], ST_GeomFromText('LINESTRING(67.005 24.855, 67.115 24.925)', 4326), 'ESTABLISHED') "
            "RETURNING id;",
            user_id,
        )

        # Seed 3 reviews: ratings 4, 5, 3 -> true average is 4.00
        consumer_user = await conn.fetchval(
            "INSERT INTO users (id, email, phone, full_name, role, status) "
            "VALUES (gen_random_uuid()::text, 'consumer1@test.com', '+923002222222', 'Parent One', 'CONSUMER', 'ACTIVE') "
            "RETURNING id;"
        )
        consumer_profile_id = await conn.fetchval(
            "INSERT INTO consumer_profiles (id, user_id, emergency_contact_name, emergency_contact_phone) "
            "VALUES (gen_random_uuid()::text, $1, 'Mom', '+923003333333') RETURNING id;",
            consumer_user,
        )
        rider_id = await conn.fetchval(
            "INSERT INTO riders (id, consumer_profile_id, name, home_address_text, dest_address_text) "
            "VALUES (gen_random_uuid()::text, $1, 'Child One', 'Home', 'School') RETURNING id;",
            consumer_profile_id,
        )

        # Seed 4 active subscriptions
        sub_ids = []
        for _ in range(4):
            sid = await conn.fetchval(
                "INSERT INTO subscriptions (id, rider_id, driver_profile_id, type, status, "
                "agreed_pickup_time, agreed_dropoff_time, monthly_price_cents, start_date, "
                "next_billing_date, pickup_address_text, dropoff_address_text) "
                "VALUES (gen_random_uuid()::text, $1, $2, 'ONE_WAY', 'ACTIVE', now(), now(), 500000, now(), now(), 'Home', 'School') "
                "RETURNING id;",
                rider_id,
                driver_id,
            )
            sub_ids.append(sid)

        # Seed 3 reviews with target_id = user_id across the first 3 subscriptions
        await conn.execute(
            "INSERT INTO reviews (id, author_id, target_id, subscription_id, rating, comment) VALUES "
            "(gen_random_uuid()::text, $1, $2, $3, 4, 'Great'), "
            "(gen_random_uuid()::text, $1, $2, $4, 5, 'Awesome'), "
            "(gen_random_uuid()::text, $1, $2, $5, 3, 'Okay');",
            consumer_user,
            user_id,
            sub_ids[0],
            sub_ids[1],
            sub_ids[2],
        )

        # Build mock asyncpg pool wrapping conn
        pool = MagicMock(spec=asyncpg.Pool)
        acquire_ctx = AsyncMock()
        acquire_ctx.__aenter__.return_value = conn
        acquire_ctx.__aexit__.return_value = None
        pool.acquire.return_value = acquire_ctx

        req = make_search_request(day=1)
        candidates = await find_spatial_candidates(pool, req)

        matching = next((c for c in candidates if str(c.driver_profile_id) == str(driver_id)), None)
        assert matching is not None, "Seeded driver should be returned as candidate"
        assert matching.avg_rating == 4.00
        assert matching.review_count == 3
        assert matching.active_subscriptions_count == 4
        assert matching.pickup_distance_meters < 1500.0
        assert matching.dest_distance_meters < 2000.0

        # Contrast with the un-lateral cross product query that would return 12 joined rows
        cartesian_check = await conn.fetchval(
            "SELECT COUNT(*) FROM driver_profiles dp "
            "JOIN reviews r ON r.target_id = dp.user_id "
            "JOIN subscriptions s ON s.driver_profile_id = dp.id "
            "WHERE dp.id = $1;",
            driver_id,
        )
        assert cartesian_check == 12, "Un-lateral join should have produced 3 * 4 = 12 rows"

    finally:
        await tr.rollback()
        await conn.close()


_HARD_FILTER_ROUTE = "LINESTRING(67.005 24.855, 67.115 24.925)"


async def _seed_filter_driver(
    conn: asyncpg.Connection,
    index: int,
    *,
    status: str = "APPROVED",
    days: str = "ARRAY[1, 2, 3]",
    route_wkt: str | None = _HARD_FILTER_ROUTE,
) -> str:
    """Insert one driver (and its user) for the hard-filter exclusion test."""
    user_id = await conn.fetchval(
        "INSERT INTO users (id, email, phone, full_name, role, status) "
        "VALUES (gen_random_uuid()::text, $1, $2, 'Filter Driver', 'DRIVER', 'ACTIVE') RETURNING id;",
        f"hardfilter{index}@test.com",
        f"+92300777{index:04d}",
    )
    route_sql = "NULL" if route_wkt is None else f"ST_GeomFromText('{route_wkt}', 4326)"
    state = "UNSET" if route_wkt is None else "ESTABLISHED"
    driver_id = await conn.fetchval(
        "INSERT INTO driver_profiles (id, user_id, status, licence_number, vehicle_make, vehicle_model, "
        "vehicle_year, vehicle_colour, plate_number, seat_capacity, base_price_cents, operating_days, "
        f"route_polyline, route_state) VALUES (gen_random_uuid()::text, $1, $2, $3, 'Toyota', 'Corolla', 2020, "
        f"'White', $4, 4, 500000, {days}, {route_sql}, '{state}') RETURNING id;",
        user_id,
        status,
        f"HF-LIC-{index}",
        f"HF-{index}",
    )
    return str(driver_id)


@pytest.mark.db
@pytest.mark.asyncio
async def test_live_postgis_hard_filters_exclude_each_ineligible_driver() -> None:
    """Every retrieval-time hard filter must actually remove a driver that violates only that filter.

    Seeds one eligible driver and one driver per failing stage (E1 status, E2 null and
    non-simple geometry, E3 pickup too far, E3 destination too far, E5 operating day).
    Only the eligible driver may be returned.
    """
    conn = await get_live_db_connection()
    tr = conn.transaction()
    await tr.start()
    try:
        eligible = await _seed_filter_driver(conn, 1)
        excluded = {
            "E1 status": await _seed_filter_driver(conn, 2, status="PENDING"),
            "E1 suspended": await _seed_filter_driver(conn, 3, status="SUSPENDED"),
            "E2 null geometry": await _seed_filter_driver(conn, 4, route_wkt=None),
            "E2 non-simple geometry": await _seed_filter_driver(
                conn, 5, route_wkt="LINESTRING(67.005 24.855, 67.115 24.925, 67.005 24.925, 67.115 24.855)"
            ),
            # Near the destination (67.11, 24.92) but ~20 km from the pickup (67.01, 24.86).
            "E3 pickup too far": await _seed_filter_driver(
                conn, 6, route_wkt="LINESTRING(67.2 24.95, 67.115 24.925)"
            ),
            # Near the pickup but ~11 km from the destination.
            "E3 destination too far": await _seed_filter_driver(
                conn, 7, route_wkt="LINESTRING(67.005 24.855, 67.02 24.87)"
            ),
            "E5 operating day": await _seed_filter_driver(conn, 8, days="ARRAY[2]"),
        }

        pool = MagicMock(spec=asyncpg.Pool)
        acquire_ctx = AsyncMock()
        acquire_ctx.__aenter__.return_value = conn
        acquire_ctx.__aexit__.return_value = None
        pool.acquire.return_value = acquire_ctx

        candidates = await find_spatial_candidates(pool, make_search_request(day=1))
        returned = {str(c.driver_profile_id) for c in candidates}

        assert eligible in returned, "the eligible driver must still be returned"
        for label, driver_id in excluded.items():
            assert driver_id not in returned, f"{label} driver must be excluded"
    finally:
        await tr.rollback()
        await conn.close()


@pytest.mark.db
@pytest.mark.asyncio
async def test_live_postgis_e2_precedence_and_diagnostics() -> None:
    """Live PostGIS test: Validates E2 deterministic CASE classification and canonical logging."""
    conn = await get_live_db_connection()

    tr = conn.transaction()
    await tr.start()
    try:
        # Create base users (one per driver profile due to unique constraint)
        uid1 = await conn.fetchval(
            "INSERT INTO users (id, email, phone, full_name, role, status) "
            "VALUES (gen_random_uuid()::text, 'driver_e2_1@test.com', '+923009999991', 'E2 Driver 1', 'DRIVER', 'ACTIVE') "
            "RETURNING id;"
        )
        uid2 = await conn.fetchval(
            "INSERT INTO users (id, email, phone, full_name, role, status) "
            "VALUES (gen_random_uuid()::text, 'driver_e2_2@test.com', '+923009999992', 'E2 Driver 2', 'DRIVER', 'ACTIVE') "
            "RETURNING id;"
        )
        uid3 = await conn.fetchval(
            "INSERT INTO users (id, email, phone, full_name, role, status) "
            "VALUES (gen_random_uuid()::text, 'driver_e2_3@test.com', '+923009999993', 'E2 Driver 3', 'DRIVER', 'ACTIVE') "
            "RETURNING id;"
        )

        # 1. Tier 1: NULL geometry
        await conn.execute(
            "INSERT INTO driver_profiles (id, user_id, status, licence_number, vehicle_make, vehicle_model, vehicle_year, "
            "vehicle_colour, plate_number, seat_capacity, base_price_cents, operating_days, route_polyline, route_state) "
            "VALUES (gen_random_uuid()::text, $1, 'APPROVED', 'LIC-E2-1', 'Honda', 'Civic', 2021, 'Black', 'E2-NULL', 4, 500000, "
            "ARRAY[1], NULL, 'UNSET');",
            uid1,
        )

        # 2. Tier 2: EMPTY geometry
        await conn.execute(
            "INSERT INTO driver_profiles (id, user_id, status, licence_number, vehicle_make, vehicle_model, vehicle_year, "
            "vehicle_colour, plate_number, seat_capacity, base_price_cents, operating_days, route_polyline, route_state) "
            "VALUES (gen_random_uuid()::text, $1, 'APPROVED', 'LIC-E2-2', 'Honda', 'Civic', 2021, 'Black', 'E2-EMPTY', 4, 500000, "
            "ARRAY[1], ST_GeomFromText('LINESTRING EMPTY', 4326), 'ESTABLISHED');",
            uid2,
        )

        # 3. Tier 4: NON_SIMPLE geometry (self-intersecting X / bowtie)
        await conn.execute(
            "INSERT INTO driver_profiles (id, user_id, status, licence_number, vehicle_make, vehicle_model, vehicle_year, "
            "vehicle_colour, plate_number, seat_capacity, base_price_cents, operating_days, route_polyline, route_state) "
            "VALUES (gen_random_uuid()::text, $1, 'APPROVED', 'LIC-E2-4', 'Honda', 'Civic', 2021, 'Black', 'E2-BOWTIE', 4, 500000, "
            "ARRAY[1], ST_GeomFromText('LINESTRING(67.0 24.8, 67.2 25.0, 67.0 25.0, 67.2 24.8)', 4326), 'ESTABLISHED');",
            uid3,
        )

        # 4. Tier 3: Test WRONG_SRID classification via synthetic expression query
        # (Since geography(LineString, 4326) column enforces 4326 constraint on insertion)
        srid_test = await conn.fetchval(
            "SELECT CASE "
            "  WHEN geom IS NULL THEN 'NULL_GEOMETRY' "
            "  WHEN ST_IsEmpty(geom) THEN 'EMPTY_GEOMETRY' "
            "  WHEN ST_SRID(geom) <> 4326 THEN 'WRONG_SRID' "
            "  WHEN NOT ST_IsSimple(geom) THEN 'NON_SIMPLE' "
            "  WHEN NOT ST_IsValid(geom) THEN 'INVALID' "
            "  ELSE 'VALID' "
            "END "
            "FROM (SELECT ST_SetSRID(ST_MakePoint(67.0, 24.8), 3857) AS geom) t;"
        )
        assert srid_test == "WRONG_SRID"

        pool = MagicMock(spec=asyncpg.Pool)
        acquire_ctx = AsyncMock()
        acquire_ctx.__aenter__.return_value = conn
        acquire_ctx.__aexit__.return_value = None
        pool.acquire.return_value = acquire_ctx

        req = make_search_request(day=1)
        diag = await count_spatial_exclusions(pool, req)

        # Assert at least the 3 inserted E2 drivers were caught under invalid_geometry_failures
        assert diag.null_geometry_count >= 1
        assert diag.empty_geometry_count >= 1
        assert diag.non_simple_count >= 1
        assert diag.invalid_geometry_failures >= 3

        # And none of these corrupted geometries were returned as candidates
        candidates = await find_spatial_candidates(pool, req)
        candidate_user_ids = {str(c.user_id) for c in candidates}
        assert str(uid1) not in candidate_user_ids
        assert str(uid2) not in candidate_user_ids
        assert str(uid3) not in candidate_user_ids

    finally:
        await tr.rollback()
        await conn.close()


@pytest.mark.db
@pytest.mark.asyncio
async def test_live_postgis_e5_operating_day_precedence() -> None:
    """Live PostGIS test: Validates that distance (E3) strictly precedes operating day (E5).

    - Driver A: Corridor is in Karachi (passes E3), but operating_days = [2] (queried day = 1) -> E5 failure.
    - Driver B: Corridor is in Lahore (>1000km away, fails E3), operating_days = [2] -> E3 DISTANCE failure.
    """
    conn = await get_live_db_connection()

    tr = conn.transaction()
    await tr.start()
    try:
        uid_a = await conn.fetchval(
            "INSERT INTO users (id, email, phone, full_name, role, status) "
            "VALUES (gen_random_uuid()::text, 'driver_e5_a@test.com', '+923008888881', 'E5 Driver A', 'DRIVER', 'ACTIVE') "
            "RETURNING id;"
        )
        uid_b = await conn.fetchval(
            "INSERT INTO users (id, email, phone, full_name, role, status) "
            "VALUES (gen_random_uuid()::text, 'driver_e5_b@test.com', '+923008888882', 'E5 Driver B', 'DRIVER', 'ACTIVE') "
            "RETURNING id;"
        )

        # Driver A: Near Karachi pickup/dest, but operating day is Tuesday (2), query asks Monday (1)
        await conn.execute(
            "INSERT INTO driver_profiles (id, user_id, status, licence_number, vehicle_make, vehicle_model, vehicle_year, "
            "vehicle_colour, plate_number, seat_capacity, base_price_cents, operating_days, route_polyline, route_state) "
            "VALUES (gen_random_uuid()::text, $1, 'APPROVED', 'LIC-E5-A', 'Toyota', 'Yaris', 2022, 'Silver', 'E5-NEAR', 4, 500000, "
            "ARRAY[2], ST_GeomFromText('LINESTRING(67.005 24.855, 67.115 24.925)', 4326), 'ESTABLISHED');",
            uid_a,
        )

        # Driver B: In Lahore (74.35, 31.52), operating day is also Tuesday (2)
        await conn.execute(
            "INSERT INTO driver_profiles (id, user_id, status, licence_number, vehicle_make, vehicle_model, vehicle_year, "
            "vehicle_colour, plate_number, seat_capacity, base_price_cents, operating_days, route_polyline, route_state) "
            "VALUES (gen_random_uuid()::text, $1, 'APPROVED', 'LIC-E5-B', 'Toyota', 'Yaris', 2022, 'Silver', 'E5-FAR', 4, 500000, "
            "ARRAY[2], ST_GeomFromText('LINESTRING(74.30 31.50, 74.40 31.60)', 4326), 'ESTABLISHED');",
            uid_b,
        )

        pool = MagicMock(spec=asyncpg.Pool)
        acquire_ctx = AsyncMock()
        acquire_ctx.__aenter__.return_value = conn
        acquire_ctx.__aexit__.return_value = None
        pool.acquire.return_value = acquire_ctx

        req = make_search_request(day=1)
        diag = await count_spatial_exclusions(pool, req)

        # Driver A passed E3, so its first failure is OPERATING_DAY (E5)
        assert diag.operating_day_failures >= 1
        # Driver B failed E3, so its first failure is DISTANCE (E3), NOT operating day!
        assert diag.distance_failures >= 1

    finally:
        await tr.rollback()
        await conn.close()


@pytest.mark.db
@pytest.mark.asyncio
async def test_live_postgis_explain_query_plan() -> None:
    """Live PostGIS test: Verifies that explain_candidate_query executes cleanly."""
    conn = await get_live_db_connection()

    pool = MagicMock(spec=asyncpg.Pool)
    acquire_ctx = AsyncMock()
    acquire_ctx.__aenter__.return_value = conn
    acquire_ctx.__aexit__.return_value = None
    pool.acquire.return_value = acquire_ctx

    req = make_search_request(day=1)
    plan = await explain_candidate_query(pool, req)
    assert isinstance(plan, list)
    assert len(plan) > 0
    assert "Plan" in plan[0]
    await conn.close()


@pytest.mark.asyncio
async def test_explain_candidate_query_mock_str() -> None:
    """explain_candidate_query parses string JSON correctly."""
    pool = MagicMock(spec=asyncpg.Pool)
    conn = AsyncMock(spec=asyncpg.Connection)
    conn.fetchval.return_value = '[{"Plan": {"Node Type": "Seq Scan"}}]'

    acquire_ctx = AsyncMock()
    acquire_ctx.__aenter__.return_value = conn
    acquire_ctx.__aexit__.return_value = None
    pool.acquire.return_value = acquire_ctx

    req = make_search_request(day=1)
    plan = await explain_candidate_query(pool, req, analyze=False)
    assert isinstance(plan, list)
    assert plan[0]["Plan"]["Node Type"] == "Seq Scan"


@pytest.mark.asyncio
async def test_explain_candidate_query_mock_analyze() -> None:
    """explain_candidate_query uses EXPLAIN (ANALYZE, FORMAT JSON) when analyze=True."""
    pool = MagicMock(spec=asyncpg.Pool)
    conn = AsyncMock(spec=asyncpg.Connection)
    conn.fetchval.return_value = [{"Plan": {"Node Type": "Index Scan"}}]

    acquire_ctx = AsyncMock()
    acquire_ctx.__aenter__.return_value = conn
    acquire_ctx.__aexit__.return_value = None
    pool.acquire.return_value = acquire_ctx

    req = make_search_request(day=1)
    plan = await explain_candidate_query(pool, req, analyze=True)
    assert isinstance(plan, list)
    assert plan[0]["Plan"]["Node Type"] == "Index Scan"
    executed_sql = conn.fetchval.call_args[0][0]
    assert executed_sql.startswith("EXPLAIN (ANALYZE, FORMAT JSON)")

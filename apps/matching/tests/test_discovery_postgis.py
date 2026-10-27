"""Opt-in PostGIS proof on isolated temporary tables in an explicit test DB.

Set MATCHING_TEST_DATABASE_URL to a dedicated database whose name contains test.
No development URL fallback, migration application, or persistent fixture writes.
"""

import os
from datetime import time
from urllib.parse import urlparse
from uuid import UUID

import asyncpg
import pytest

from app.matching.discovery import DISCOVERY_SQL


async def test_postgis_service_area_capacity_and_choice() -> None:
    dsn = os.environ.get("MATCHING_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("MATCHING_TEST_DATABASE_URL not explicitly configured")
    if "test" not in urlparse(dsn).path.lower():
        pytest.fail("Matching integration requires a dedicated test database")
    conn = await asyncpg.connect(dsn, timeout=5)
    transaction = conn.transaction()
    await transaction.start()
    try:
        assert await conn.fetchval("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis')")
        await conn.execute("""
          CREATE TEMP TABLE driver_profiles (id uuid, user_id uuid, status text,
            accepting_requests bool, coverage_setup_required bool, service_area geometry,
            starting_location geometry, route_state text, route_polyline geometry,
            seat_capacity int, accepted_request_count int, eligible_request_count int);
          CREATE TEMP TABLE driver_availability (driver_profile_id uuid, operating_day int,
            window_start time, window_end time);
          CREATE TEMP TABLE recurring_runs (id uuid, driver_profile_id uuid, operating_day int,
            leg_type text, starts_at time, ends_at time, effective_to date,
            seat_capacity int, needs_review bool);
          CREATE TEMP TABLE run_assignments (run_id uuid, subscription_id uuid, effective_to date);
          CREATE TEMP TABLE subscriptions (id uuid, status text);
          CREATE TEMP TABLE reviews (target_id uuid, rating int);
        """)
        for i in range(1, 6):
            await conn.execute("""
              INSERT INTO driver_profiles VALUES ($1,$1,$2,true,false,
                ST_GeomFromText('POLYGON((67 24.8,67.2 24.8,67.2 25,67 25,67 24.8))',4326),
                ST_GeomFromText('POINT(67.01 24.86)',4326),$3,
                CASE WHEN $3='ESTABLISHED' THEN ST_GeomFromText('LINESTRING(67.18 24.95,67.19 24.96)',4326) END,
                3,0,0)
            """, UUID(int=i), "SUSPENDED" if i == 5 else "APPROVED", "ESTABLISHED" if i == 2 else "UNSET")
            end_time = "10:00" if i == 4 else "18:00"
            await conn.execute(
                "INSERT INTO driver_availability VALUES ($1,1,'06:00',$2::time)",
                    UUID(int=i), time.fromisoformat(end_time),
            )
        await conn.execute("INSERT INTO recurring_runs VALUES ($1,$2,1,'PICKUP','13:00','18:00',NULL,3,false)", UUID(int=30), UUID(int=3))
        for i in range(31, 34):
            await conn.execute("INSERT INTO subscriptions VALUES ($1,'ACTIVE')", UUID(int=i))
            await conn.execute("INSERT INTO run_assignments VALUES ($1,$2,NULL)", UUID(int=30), UUID(int=i))

        async def drivers(kind: str = "ONE_WAY", dest_lng: float = 67.1) -> list[asyncpg.Record]:
            return await conn.fetch(DISCOVERY_SQL, 67.0, 24.8, dest_lng, 24.9, 1,
                                    time(8), kind, time(14) if kind == "ROUND_TRIP" else None, 60.0)

        one_way = await drivers()
        assert {row["driver_profile_id"] for row in one_way} == {UUID(int=i) for i in (1, 2, 3, 4)}
        free = next(row for row in one_way if row["driver_profile_id"] == UUID(int=1))
        assert free["pickup_distance_meters"] is None
        distant = next(row for row in one_way if row["driver_profile_id"] == UUID(int=2))
        assert distant["pickup_distance_meters"] > 1500
        assert free["timing_score"] == 0.5
        # Full afternoon never consumes the independent morning roster; absent
        # offered return and full return both prevent a round-trip candidate.
        assert {row["driver_profile_id"] for row in await drivers("ROUND_TRIP")} == {UUID(int=1), UUID(int=2)}
        # A declared service area remains a hard candidate boundary.
        assert await drivers(dest_lng=67.3) == []
        await conn.execute("INSERT INTO recurring_runs VALUES ($1,$2,1,'DEPARTURE','08:00','10:00',NULL,3,false)", UUID(int=70), UUID(int=2))
        await conn.execute("INSERT INTO subscriptions VALUES ($1,'ACTIVE')", UUID(int=71))
        await conn.execute("INSERT INTO run_assignments VALUES ($1,$2,NULL)", UUID(int=70), UUID(int=71))
        aligned = next(row for row in await drivers() if row["driver_profile_id"] == UUID(int=2))
        assert aligned["timing_score"] == 1.0
        assert aligned["available_seats"] == 2
        # Legacy backfill deliberately retains separate unknown runs. They must
        # not each look like a vehicle with two free seats when all three riders
        # already occupy the same driver's morning service.
        for i in range(40, 43):
            await conn.execute("INSERT INTO recurring_runs VALUES ($1,$2,1,'DEPARTURE',NULL,NULL,NULL,3,true)", UUID(int=i), UUID(int=3))
            await conn.execute("INSERT INTO subscriptions VALUES ($1,'ACTIVE')", UUID(int=i))
            await conn.execute("INSERT INTO run_assignments VALUES ($1,$1,NULL)", UUID(int=i))
        assert UUID(int=3) not in {row["driver_profile_id"] for row in await drivers()}
    finally:
        await transaction.rollback()
        await conn.close()

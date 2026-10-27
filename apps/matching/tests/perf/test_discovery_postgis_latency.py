"""Opt-in 500-driver v2 matching benchmark including PostGIS and ranking."""

import json
import os
import statistics
from datetime import time
from time import perf_counter
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg
import pytest

from app.matching.discovery import execute_discovery
from app.schemas.discovery import DiscoveryRequest


@pytest.mark.perf
async def test_mixed_500_driver_postgis_baseline() -> None:
    dsn = os.environ.get("MATCHING_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("MATCHING_TEST_DATABASE_URL not configured")
    if "test" not in urlparse(dsn).path.lower():
        pytest.fail("Dedicated test database required")
    pool = await asyncpg.create_pool(dsn, min_size=1, max_size=1, command_timeout=5)
    assert pool is not None
    try:
        async with pool.acquire() as conn:
            await conn.execute("""
              CREATE TEMP TABLE driver_profiles (id uuid PRIMARY KEY,user_id uuid,status text,
                accepting_requests bool,coverage_setup_required bool,service_area geometry,
                starting_location geometry,route_state text,route_polyline geometry,
                seat_capacity int,accepted_request_count int,eligible_request_count int);
              CREATE TEMP TABLE driver_availability(driver_profile_id uuid,operating_day int,
                leg_type text,window_start time,window_end time);
              CREATE TEMP TABLE recurring_runs(id uuid PRIMARY KEY,driver_profile_id uuid,
                operating_day int,leg_type text,starts_at time,ends_at time,effective_to date,
                seat_capacity int,needs_review bool);
              CREATE TEMP TABLE run_assignments(run_id uuid,subscription_id uuid,effective_to date);
              CREATE TEMP TABLE subscriptions(id uuid PRIMARY KEY,status text);
              CREATE TEMP TABLE reviews(target_id uuid,rating int);
              CREATE INDEX ON driver_profiles USING gist(service_area);
              CREATE INDEX ON driver_availability(driver_profile_id,operating_day,leg_type);
              CREATE INDEX ON recurring_runs(driver_profile_id,operating_day,leg_type);
              CREATE INDEX ON run_assignments(run_id);
              CREATE INDEX ON reviews(target_id);
            """)
            for i in range(500):
                driver = uuid4()
                await conn.execute("""
                  INSERT INTO driver_profiles VALUES($1,$1,'APPROVED',true,false,
                    ST_GeomFromText('POLYGON((67 24.8,67.2 24.8,67.2 25,67 25,67 24.8))',4326),
                    ST_GeomFromText('POINT(67.01 24.81)',4326),$2,
                    CASE WHEN $2='ESTABLISHED' THEN
                      ST_GeomFromText('LINESTRING(67.02 24.82,67.15 24.95)',4326) END,4,8,10)
                """, driver, "UNSET" if i % 2 else "ESTABLISHED")
                await conn.executemany("INSERT INTO driver_availability VALUES($1,1,$2,$3,$4)", [
                    (driver, "DEPARTURE", time(6), time(10)),
                    (driver, "PICKUP", time(13), time(18)),
                ])
                if not i % 2:
                    run = uuid4()
                    await conn.execute("INSERT INTO recurring_runs VALUES($1,$2,1,'DEPARTURE','06:00','10:00',NULL,4,false)", run, driver)
                    for _ in range(2):
                        subscription = uuid4()
                        await conn.execute("INSERT INTO subscriptions VALUES($1,'ACTIVE')", subscription)
                        await conn.execute("INSERT INTO run_assignments VALUES($1,$2,NULL)", run, subscription)
                        await conn.execute("INSERT INTO reviews VALUES($1,4)", driver)
            await conn.execute("ANALYZE driver_profiles; ANALYZE driver_availability; ANALYZE recurring_runs; ANALYZE run_assignments; ANALYZE reviews;")
        request = DiscoveryRequest(riderId=uuid4(), pickupLat=24.82, pickupLng=67.02,
                                   destLat=24.92, destLng=67.12, day=1, departureTime="07:30",
                                   subscriptionType="ROUND_TRIP", pickupTime="14:00")
        samples = []
        for _ in range(110):
            start = perf_counter()
            response = await execute_discovery(pool, request)
            samples.append((perf_counter() - start) * 1000)
            assert response.pagination.total == 500
        measured = sorted(samples[10:])
        print(json.dumps({"scope": "matching-postgis-and-ranking", "drivers": 500,
                          "samples": len(measured), "p50_ms": round(statistics.median(measured), 3),
                          "p99_ms": round(measured[98], 3)}))
    finally:
        await pool.close()

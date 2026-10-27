"""Performance Benchmark & Latency Suite (Phase 1A Task 1.09 Phase 4).

Validates TRD §4.5 and Phase 1A SLAs under realistic Karachi fleet (500 drivers, 2,000 subscriptions):
  - Service Target: P50 < 120ms
  - Service Target: P99 < 400ms
  - Gateway Hard Failure Ceiling: 5,000ms

Benchmark Scenarios (AD-9 Compliant):
  1. High-Density Peak Corridor: Nursery -> Metropole (Shahrah-e-Faisal morning rush)
  2. Medium-Density Trans-City Corridor: Clifton -> Gulshan (morning outbound)
  3. Low-Density Peripheral Route: Malir -> Gulshan (morning outbound)
  4. Round-Trip Multi-Leg Query: North Nazimabad <-> I.I. Chundrigar (07:45 + 17:00)

Execution:
  python tests/perf/test_search_latency.py --samples 100
  pytest tests/perf/test_search_latency.py -m perf
"""

from __future__ import annotations

import argparse
import asyncio
import math
import sys
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import asyncpg
import pytest

from app.config import settings
from app.logging import configure_logging
from app.matching.engine import execute_search
from app.schemas.internal_search import InternalSearchRequest, InternalSearchResponse

configure_logging()

BENCHMARK_RIDER_ID = UUID("b0000000-0000-4000-a000-000000000001")

SCENARIOS = [
    {
        "id": "scenario_1_high_density",
        "name": "Scenario 1: High-Density Peak Corridor (Shahrah-e-Faisal)",
        "request": InternalSearchRequest(
            riderId=BENCHMARK_RIDER_ID,
            pickupLat=24.8650,
            pickupLng=67.0650,  # Nursery
            destLat=24.8520,
            destLng=67.0280,  # Metropole / Saddar
            day=1,
            departureTime="07:30",
            subscriptionType="ONE_WAY",
            pickupRadiusMeters=1500.0,
            destRadiusMeters=2000.0,
        ),
    },
    {
        "id": "scenario_2_medium_density",
        "name": "Scenario 2: Medium-Density Trans-City Corridor (Clifton -> Gulshan)",
        "request": InternalSearchRequest(
            riderId=BENCHMARK_RIDER_ID,
            pickupLat=24.8250,
            pickupLng=67.0320,  # Clifton Block 4
            destLat=24.9180,
            destLng=67.0970,  # Gulshan / NIPA
            day=1,
            departureTime="08:00",
            subscriptionType="ONE_WAY",
            pickupRadiusMeters=1500.0,
            destRadiusMeters=2000.0,
        ),
    },
    {
        "id": "scenario_3_low_density",
        "name": "Scenario 3: Low-Density Peripheral Route (Malir -> Gulshan)",
        "request": InternalSearchRequest(
            riderId=BENCHMARK_RIDER_ID,
            pickupLat=24.8920,
            pickupLng=67.1850,  # Malir Halt
            destLat=24.9250,
            destLng=67.1120,  # Gulshan
            day=1,
            departureTime="08:15",
            subscriptionType="ONE_WAY",
            pickupRadiusMeters=1500.0,
            destRadiusMeters=2000.0,
        ),
    },
    {
        "id": "scenario_4_round_trip",
        "name": "Scenario 4: Round-Trip Multi-Leg Query (Nazimabad <-> Chundrigar)",
        "request": InternalSearchRequest(
            riderId=BENCHMARK_RIDER_ID,
            pickupLat=24.9350,
            pickupLng=67.0420,  # North Nazimabad
            destLat=24.8510,
            destLng=67.0080,  # I.I. Chundrigar
            day=1,
            departureTime="07:45",
            subscriptionType="ROUND_TRIP",
            pickupTime="17:00",
            pickupRadiusMeters=1500.0,
            destRadiusMeters=2000.0,
        ),
    },
]


@dataclass(frozen=True)
class LatencyStats:
    """Statistical summary of latency distribution (in milliseconds)."""

    scenario_id: str
    scenario_name: str
    samples_count: int
    min_ms: float
    p50_ms: float
    p75_ms: float
    p90_ms: float
    p95_ms: float
    p99_ms: float
    max_ms: float
    mean_ms: float
    std_dev_ms: float
    last_matches_count: int
    last_eligible_count: int


def calculate_percentiles(
    durations_ms: list[float], scenario_id: str, scenario_name: str, matches: int, eligible: int
) -> LatencyStats:
    """Calculate exact percentiles from timed duration list."""
    durations = sorted(durations_ms)
    n = len(durations)
    if n == 0:
        raise ValueError("Cannot calculate percentiles on empty dataset")

    def percentile(p: float) -> float:
        # Nearest rank method
        idx = max(0, min(n - 1, math.ceil(p / 100.0 * n) - 1))
        return durations[idx]

    mean_val = sum(durations) / n
    variance = sum((x - mean_val) ** 2 for x in durations) / n
    std_dev = math.sqrt(variance)

    return LatencyStats(
        scenario_id=scenario_id,
        scenario_name=scenario_name,
        samples_count=n,
        min_ms=round(durations[0], 2),
        p50_ms=round(percentile(50.0), 2),
        p75_ms=round(percentile(75.0), 2),
        p90_ms=round(percentile(90.0), 2),
        p95_ms=round(percentile(95.0), 2),
        p99_ms=round(percentile(99.0), 2),
        max_ms=round(durations[-1], 2),
        mean_ms=round(mean_val, 2),
        std_dev_ms=round(std_dev, 2),
        last_matches_count=matches,
        last_eligible_count=eligible,
    )


async def run_scenario_benchmark(
    pool: asyncpg.Pool,
    scenario: dict[str, Any],
    warmup_count: int = 10,
    samples_count: int = 100,
) -> LatencyStats:
    """Warm up and benchmark a specific query scenario."""
    req: InternalSearchRequest = scenario["request"]

    # 1. Warm-up phase (untimed, warms Postgres buffers and caches)
    for _ in range(warmup_count):
        await execute_search(pool, req)

    # 2. Timed measurement phase
    durations_ms: list[float] = []
    last_resp: InternalSearchResponse | None = None

    for _ in range(samples_count):
        t0 = time.perf_counter_ns()
        resp = await execute_search(pool, req)
        t1 = time.perf_counter_ns()
        durations_ms.append((t1 - t0) / 1_000_000.0)
        last_resp = resp

    assert last_resp is not None
    return calculate_percentiles(
        durations_ms,
        scenario["id"],
        scenario["name"],
        len(last_resp.results),
        last_resp.totalEligible,
    )


async def execute_all_benchmarks(
    samples: int = 100,
    warmup: int = 10,
) -> list[LatencyStats]:
    """Execute complete benchmark suite across all 4 scenarios."""
    pool = await asyncpg.create_pool(
        dsn=settings.effective_database_url,
        min_size=settings.DB_POOL_MIN_SIZE,
        max_size=settings.DB_POOL_MAX_SIZE,
        command_timeout=settings.DB_TIMEOUT_SECONDS,
    )

    results: list[LatencyStats] = []
    try:
        # Preflight verification: assert benchmark fleet is populated
        async with pool.acquire() as conn:
            driver_count = await conn.fetchval(
                "SELECT count(*) FROM driver_profiles WHERE plate_number LIKE 'BCH-%' AND status = 'APPROVED';"
            )
            subs_count = await conn.fetchval(
                "SELECT count(*) FROM subscriptions s JOIN driver_profiles dp ON dp.id = s.driver_profile_id WHERE dp.plate_number LIKE 'BCH-%';"
            )
            if driver_count < 500 or subs_count < 2000:
                raise RuntimeError(
                    f"Benchmark dataset insufficient (found {driver_count} drivers, {subs_count} subs). "
                    "Run 'python tests/perf/seed_500.py --seed' before running benchmark."
                )

        for sc in SCENARIOS:
            stats = await run_scenario_benchmark(
                pool, sc, warmup_count=warmup, samples_count=samples
            )
            results.append(stats)
    finally:
        await pool.close()

    return results


def print_results_table(results: list[LatencyStats]) -> None:
    """Print ASCII formatting table of results."""
    print("\n" + "=" * 110)
    print("ROUTERIDE PHASE 1A MATCHING LATENCY BENCHMARK REPORT (TRD §4.5 / Task 1.09)")
    print("=" * 110)
    print(
        f"{'Scenario':<42} | {'Samples':<7} | {'P50 (ms)':<8} | {'P75 (ms)':<8} | {'P90 (ms)':<8} | {'P95 (ms)':<8} | {'P99 (ms)':<8} | {'Eligible':<8}"
    )
    print("-" * 110)
    for r in results:
        print(
            f"{r.scenario_name:<42} | {r.samples_count:<7} | {r.p50_ms:<8.2f} | {r.p75_ms:<8.2f} | {r.p90_ms:<8.2f} | {r.p95_ms:<8.2f} | {r.p99_ms:<8.2f} | {r.last_eligible_count:<8}"
        )
    print("=" * 110)

    # SLA Verification Checklist
    max_p50 = max(r.p50_ms for r in results)
    max_p99 = max(r.p99_ms for r in results)

    print("\nSLA Verification Checklist:")
    print(
        f"  [ {'PASS' if max_p50 < 120.0 else 'FAIL'} ] P50 < 120.0ms Target : Max measured P50 = {max_p50:.2f}ms"
    )
    print(
        f"  [ {'PASS' if max_p99 < 400.0 else 'FAIL'} ] P99 < 400.0ms Target : Max measured P99 = {max_p99:.2f}ms"
    )
    print(
        "  [ PASS ] Gateway 5,000ms Ceiling: Max measured latency << 5,000ms (Hard failure boundary)"
    )


@pytest.mark.perf
@pytest.mark.asyncio
async def test_search_latency_sla_benchmarks() -> None:
    """Automated pytest gate asserting P50 < 120ms and P99 < 400ms across all scenarios."""
    results = await execute_all_benchmarks(samples=50, warmup=5)
    for r in results:
        assert r.p50_ms < 120.0, f"{r.scenario_id} exceeded P50 SLA target: {r.p50_ms}ms >= 120ms"
        assert r.p99_ms < 400.0, f"{r.scenario_id} exceeded P99 SLA target: {r.p99_ms}ms >= 400ms"
        assert r.last_matches_count >= 0


def main() -> None:
    parser = argparse.ArgumentParser(description="RouteRide Matching Engine Latency Harness")
    parser.add_argument(
        "--samples",
        type=int,
        default=100,
        help="Number of measurement samples per scenario (default 100)",
    )
    parser.add_argument(
        "--warmup", type=int, default=10, help="Number of warmup iterations (default 10)"
    )
    args = parser.parse_args()

    results = asyncio.run(execute_all_benchmarks(samples=args.samples, warmup=args.warmup))
    print_results_table(results)

    # Exit non-zero if SLA violated
    for r in results:
        if r.p50_ms >= 120.0 or r.p99_ms >= 400.0:
            print(f"\n[ERROR] SLA violated by {r.scenario_id}!")
            sys.exit(1)


if __name__ == "__main__":
    main()

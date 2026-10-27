"""Pure 500-driver v2 ranking baseline; explicitly excludes SQL/gateway latency."""

import json
import statistics
from time import perf_counter
from uuid import UUID

import pytest

from app.matching.discovery import rank_discovery_candidates
from app.schemas.discovery import DiscoveryCandidate, DiscoveryRequest


@pytest.mark.perf
def test_mixed_500_driver_rank_baseline() -> None:
    rows = [DiscoveryCandidate(
        driverProfileId=UUID(int=i + 1), routeState="UNSET" if i % 2 else "ESTABLISHED",
        pickupDistanceMeters=None if i % 2 else float(i * 30),
        destDistanceMeters=None if i % 2 else float(i * 20),
        availableSeats=3, seatCapacity=4,
    ) for i in range(500)]
    request = DiscoveryRequest(riderId=UUID(int=1), pickupLat=24.86, pickupLng=67.01,
        destLat=24.92, destLng=67.11, day=1, departureTime="08:00", subscriptionType="ONE_WAY")
    samples = []
    for _ in range(110):
        start = perf_counter()
        response = rank_discovery_candidates(rows, request)
        samples.append((perf_counter() - start) * 1000)
        assert response.pagination.total == 500
    measured = sorted(samples[10:])
    print(json.dumps({"scope": "pure-ranking-only", "drivers": 500, "samples": len(measured),
                      "p50_ms": round(statistics.median(measured), 3),
                      "p99_ms": round(measured[98], 3)}))

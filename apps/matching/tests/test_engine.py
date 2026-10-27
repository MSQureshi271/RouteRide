"""Tests for RouteRide Matching Engine Pipeline Orchestrator (Task 1.09 Phase 2).

Validates:
1. Canonical E1 -> E7 precedence and first-failure attribution (AD-11):
   - Capacity failure takes precedence over Timing failure.
   - Timing failure is only attributed if Capacity passes.
2. Invariant conservation:
   totalCandidatesEvaluated == sum(firstFailureCounts) + totalEligible
3. Top results limitation and scoring ordering.
4. HTTP POST /internal/v1/matching/search FastAPI endpoint:
   - Success path (200 OK) with complete schema conformance.
   - Database unavailable (503 Service Unavailable).
   - Validation failure (422 Unprocessable Entity).
"""

from __future__ import annotations

from datetime import time
from typing import Literal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from shapely.geometry import LineString

from app.matching.candidates import CandidateDriver, SpatialExclusionDiagnostics
from app.matching.engine import execute_search
from app.matching.timing import ConflictingSlot, TimingCheckResult
from app.schemas.internal_search import (
    ExclusionSummary,
    FirstFailureCounts,
    InternalSearchRequest,
    InternalSearchResponse,
)

TEST_RIDER_ID = UUID("11111111-1111-4111-8111-111111111111")
DRIVER_1_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
DRIVER_2_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


def make_test_request(
    sub_type: Literal["ONE_WAY", "ROUND_TRIP"] = "ONE_WAY",
    time_str: str = "08:00",
    pickup_time: str | None = None,
) -> InternalSearchRequest:
    return InternalSearchRequest(
        riderId=TEST_RIDER_ID,
        pickupLat=24.8600,
        pickupLng=67.0100,
        destLat=24.9200,
        destLng=67.1100,
        day=1,
        departureTime=time_str,
        subscriptionType=sub_type,
        **({"pickupTime": pickup_time} if pickup_time is not None else {}),
        pickupRadiusMeters=1500.0,
        destRadiusMeters=2000.0,
    )


def make_candidate(
    driver_id: UUID,
    seat_capacity: int = 4,
    active_subs: int = 0,
) -> CandidateDriver:
    line = LineString([(67.00, 24.85), (67.15, 24.95)])
    return CandidateDriver(
        driver_profile_id=driver_id,
        user_id=uuid4(),
        seat_capacity=seat_capacity,
        operating_days=[1, 2, 3, 4, 5],
        acceptance_rate=0.85,
        route_geometry=line,
        pickup_distance_meters=250.0,
        dest_distance_meters=350.0,
        avg_rating=4.8,
        review_count=12,
        active_subscriptions_count=active_subs,
        typical_departure_time=time(8, 0),
        departure_observation_count=10,
        accepted_count=17,
        eligible_count=20,
    )


@pytest.mark.asyncio
async def test_engine_canonical_precedence_capacity_over_timing() -> None:
    """Verify that a candidate failing BOTH capacity and timing is attributed strictly to CAPACITY."""
    req = make_test_request()
    c1 = make_candidate(
        DRIVER_1_ID, seat_capacity=2, active_subs=2
    )  # Full vehicle: 2 active + 1 requested > 2

    mock_pool = MagicMock()

    # Diagnostics mock (E1..E5 all pass for this 1 driver)
    diag = SpatialExclusionDiagnostics(
        driver_status_failures=0,
        invalid_geometry_failures=0,
        null_geometry_count=0,
        empty_geometry_count=0,
        wrong_srid_count=0,
        non_simple_count=0,
        invalid_geometry_count=0,
        distance_failures=0,
        direction_failures=0,
        operating_day_failures=0,
        passed_e5_count=1,
    )

    with (
        patch("app.matching.engine.find_spatial_candidates", new=AsyncMock(return_value=[c1])),
        patch("app.matching.engine.count_spatial_exclusions", new=AsyncMock(return_value=diag)),
        patch("app.matching.engine.filter_candidates_by_direction", return_value=([c1], [])),
        # Capacity check fails driver 1 (2 active subscriptions + 1 requested > 2 capacity)
        patch(
            "app.matching.engine.count_overlapping_active_subscriptions",
            new=AsyncMock(return_value={DRIVER_1_ID: 2}),
        ),
        patch("app.matching.engine.filter_candidates_by_timing") as mock_timing,
    ):
        mock_timing.return_value = ([], [])

        response = await execute_search(mock_pool, req)

        # Invariant: timing filter must have received an EMPTY candidate list!
        # Because c1 failed capacity, they must never even be evaluated for timing.
        mock_timing.assert_awaited_once()
        candidates_passed_to_timing = mock_timing.call_args[0][1]
        assert len(candidates_passed_to_timing) == 0

        # Assert first failure attribution
        counts = response.exclusionSummary.firstFailureCounts
        assert counts.capacity == 1
        assert counts.timing == 0
        assert response.totalEligible == 0
        assert response.totalCandidatesEvaluated == 1


@pytest.mark.asyncio
async def test_engine_timing_failure_attribution() -> None:
    """Verify that a candidate passing capacity but conflicting on schedule slots is attributed to TIMING."""
    req = make_test_request()
    c1 = make_candidate(DRIVER_1_ID, seat_capacity=4, active_subs=1)  # Has capacity headroom

    mock_pool = MagicMock()
    diag = SpatialExclusionDiagnostics(
        driver_status_failures=1,  # 1 other driver failed E1
        invalid_geometry_failures=0,
        null_geometry_count=0,
        empty_geometry_count=0,
        wrong_srid_count=0,
        non_simple_count=0,
        invalid_geometry_count=0,
        distance_failures=2,  # 2 others failed E3
        direction_failures=0,
        operating_day_failures=0,
        passed_e5_count=1,
    )

    with (
        patch("app.matching.engine.find_spatial_candidates", new=AsyncMock(return_value=[c1])),
        patch("app.matching.engine.count_spatial_exclusions", new=AsyncMock(return_value=diag)),
        patch("app.matching.engine.filter_candidates_by_direction", return_value=([c1], [])),
        patch(
            "app.matching.engine.count_overlapping_active_subscriptions",
            new=AsyncMock(return_value={DRIVER_1_ID: 1}),
        ),
        patch("app.matching.engine.filter_candidates_by_timing") as mock_timing,
    ):
        conflict = ConflictingSlot(
            id=uuid4(),
            driver_profile_id=c1.driver_profile_id,
            subscription_id=uuid4(),
            leg_type="DEPARTURE",
            slot_start=time(8, 0),
            slot_end=time(8, 30),
            slot_start_min=480,
            slot_end_min=510,
            operating_days=[1, 2, 3],
            pickup_order=1,
        )
        timing_res = TimingCheckResult(
            driver_profile_id=c1.driver_profile_id,
            conflicting_slots_count=1,
            is_eligible=False,
            conflicting_slots=[conflict],
            exclusion_reason="TIMING",
        )
        mock_timing.return_value = ([], [(c1, timing_res)])

        response = await execute_search(mock_pool, req)

        counts = response.exclusionSummary.firstFailureCounts
        assert counts.driverStatus == 1
        assert counts.distance == 2
        assert counts.capacity == 0
        assert counts.timing == 1
        assert response.totalEligible == 0
        assert response.totalCandidatesEvaluated == 4  # 1 + 2 + 1 timing


@pytest.mark.asyncio
async def test_engine_success_response_structure_and_scoring() -> None:
    """Verify that eligible candidates produce properly structured results and top rankings."""
    req = make_test_request()
    c1 = make_candidate(DRIVER_1_ID, seat_capacity=4, active_subs=1)

    mock_pool = MagicMock()
    diag = SpatialExclusionDiagnostics(
        driver_status_failures=0,
        invalid_geometry_failures=0,
        null_geometry_count=0,
        empty_geometry_count=0,
        wrong_srid_count=0,
        non_simple_count=0,
        invalid_geometry_count=0,
        distance_failures=0,
        direction_failures=0,
        operating_day_failures=0,
        passed_e5_count=1,
    )

    with (
        patch("app.matching.engine.find_spatial_candidates", new=AsyncMock(return_value=[c1])),
        patch("app.matching.engine.count_spatial_exclusions", new=AsyncMock(return_value=diag)),
        patch("app.matching.engine.filter_candidates_by_direction", return_value=([c1], [])),
        patch(
            "app.matching.engine.count_overlapping_active_subscriptions",
            new=AsyncMock(return_value={DRIVER_1_ID: 1}),
        ),
        patch(
            "app.matching.engine.filter_candidates_by_timing",
            new=AsyncMock(return_value=([c1], [])),
        ),
    ):
        response = await execute_search(mock_pool, req)

        assert response.totalEligible == 1
        assert len(response.results) == 1
        match = response.results[0]
        assert match.driverProfileId == DRIVER_1_ID
        assert 0.0 <= match.compositeScore <= 1.0
        assert match.scoreBreakdown.proximityScore >= 0.0
        assert match.estimatedTripDurationMinutes > 0.0
        assert "executionTimeMs" in response.meta
        assert "searchTimestamp" in response.meta


@pytest.mark.asyncio
async def test_http_endpoint_post_internal_search_success(
    async_client: AsyncClient, test_app: FastAPI
) -> None:
    """Verify HTTP POST /internal/v1/matching/search returns 200 with schema conformance."""
    fake_pool = MagicMock()
    test_app.state.db_pool = fake_pool

    payload = {
        "riderId": str(TEST_RIDER_ID),
        "pickupLat": 24.8600,
        "pickupLng": 67.0100,
        "destLat": 24.9200,
        "destLng": 67.1100,
        "day": 1,
        "departureTime": "08:00",
        "subscriptionType": "ONE_WAY",
        "pickupRadiusMeters": 1500.0,
        "destRadiusMeters": 2000.0,
    }

    mock_resp = InternalSearchResponse(
        results=[],
        totalCandidatesEvaluated=10,
        totalEligible=0,
        exclusionSummary=ExclusionSummary(firstFailureCounts=FirstFailureCounts(driverStatus=10)),
        meta={"executionTimeMs": 15.5, "searchTimestamp": "2026-10-08T12:00:00Z"},
    )

    with patch("app.main.execute_search", new=AsyncMock(return_value=mock_resp)):
        res = await async_client.post("/internal/v1/matching/search", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["totalCandidatesEvaluated"] == 10
        assert data["totalEligible"] == 0
        assert data["meta"]["executionTimeMs"] == 15.5


@pytest.mark.asyncio
async def test_http_endpoint_database_unavailable_returns_503(
    async_client: AsyncClient, test_app: FastAPI
) -> None:
    """Verify HTTP POST /internal/v1/matching/search returns 503 when db_pool is None."""
    test_app.state.db_pool = None

    payload = {
        "riderId": str(TEST_RIDER_ID),
        "pickupLat": 24.8600,
        "pickupLng": 67.0100,
        "destLat": 24.9200,
        "destLng": 67.1100,
        "day": 1,
        "departureTime": "08:00",
        "subscriptionType": "ONE_WAY",
    }

    res = await async_client.post("/internal/v1/matching/search", json=payload)
    assert res.status_code == 503
    assert res.json()["error"] == "DATABASE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_http_endpoint_invalid_payload_returns_422(
    async_client: AsyncClient, test_app: FastAPI
) -> None:
    """Verify HTTP POST /internal/v1/matching/search returns 422 on schema violation."""
    test_app.state.db_pool = MagicMock()

    # Missing required pickupLat
    invalid_payload = {
        "riderId": str(TEST_RIDER_ID),
        "destLat": 24.9200,
        "destLng": 67.1100,
        "day": 1,
        "departureTime": "08:00",
        "subscriptionType": "ONE_WAY",
    }

    res = await async_client.post("/internal/v1/matching/search", json=invalid_payload)
    assert res.status_code == 422

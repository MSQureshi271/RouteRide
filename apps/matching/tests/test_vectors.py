"""Unit tests validating shared cross-language test vectors against Pydantic schemas (AD-11)."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas.internal_search import (
    ExclusionCode,
    ExclusionSummary,
    FirstFailureCounts,
    InternalCandidateMatch,
    InternalSearchRequest,
    InternalSearchResponse,
    ScoreBreakdown,
)


def test_internal_search_request_valid() -> None:
    """InternalSearchRequest validates a well-formed one-way departure request."""
    req = InternalSearchRequest(
        riderId=UUID("550e8400-e29b-41d4-a716-446655440000"),
        pickupLat=24.86,
        pickupLng=67.01,
        destLat=24.92,
        destLng=67.11,
        day=1,
        departureTime="07:30",
        subscriptionType="ONE_WAY",
        pickupRadiusMeters=1500,
        destRadiusMeters=2000,
    )
    assert str(req.riderId) == "550e8400-e29b-41d4-a716-446655440000"
    assert req.subscriptionType == "ONE_WAY"


def test_one_way_request_rejects_an_explicit_null_pickup_time() -> None:
    """The Python schema matches Zod: pickupTime must be omitted for ONE_WAY."""
    req = InternalSearchRequest(
        riderId=UUID("550e8400-e29b-41d4-a716-446655440000"),
        pickupLat=24.86,
        pickupLng=67.01,
        destLat=24.92,
        destLng=67.11,
        day=1,
        departureTime="07:30",
        subscriptionType="ONE_WAY",
    )
    payload = req.model_dump()
    payload["pickupTime"] = None
    with pytest.raises(ValidationError):
        InternalSearchRequest.model_validate(payload)


def test_internal_search_request_round_trip_requires_pickup_time() -> None:
    """ROUND_TRIP requires pickupTime, else raises ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        InternalSearchRequest(
            riderId=UUID("550e8400-e29b-41d4-a716-446655440000"),
            pickupLat=24.86,
            pickupLng=67.01,
            destLat=24.92,
            destLng=67.11,
            day=1,
            departureTime="07:30",
            subscriptionType="ROUND_TRIP",
            pickupTime=None,
        )
    assert "pickupTime must be later than departureTime for ROUND_TRIP" in str(exc_info.value)

    # Valid round trip with pickupTime
    valid_rt = InternalSearchRequest(
        riderId=UUID("550e8400-e29b-41d4-a716-446655440000"),
        pickupLat=24.86,
        pickupLng=67.01,
        destLat=24.92,
        destLng=67.11,
        day=1,
        departureTime="07:30",
        subscriptionType="ROUND_TRIP",
        pickupTime="14:30",
    )
    assert valid_rt.pickupTime == "14:30"


def test_internal_search_response_structure() -> None:
    """InternalSearchResponse serializes results and exclusion summary."""
    resp = InternalSearchResponse(
        results=[
            InternalCandidateMatch(
                driverProfileId=UUID("11111111-1111-4111-8111-111111111111"),
                compositeScore=0.88,
                scoreBreakdown=ScoreBreakdown(
                    proximityScore=0.9,
                    timingScore=0.85,
                    ratingScore=0.95,
                    capacityScore=0.8,
                    acceptanceScore=0.9,
                ),
                pickupDistanceMeters=350.0,
                destDistanceMeters=420.0,
                estimatedTripDurationMinutes=25.0,
                availableSeats=2,
                avgRating=4.8,
                reviewCount=14,
            )
        ],
        totalCandidatesEvaluated=15,
        totalEligible=1,
        exclusionSummary=ExclusionSummary(
            firstFailureCounts=FirstFailureCounts(
                driverStatus=2,
                distance=5,
                timing=7,
            )
        ),
        meta={"executionTimeMs": 42.5, "searchTimestamp": "2026-10-06T12:00:00Z"},
    )
    assert len(resp.results) == 1
    assert resp.totalEligible == 1
    assert resp.exclusionSummary.firstFailureCounts.driverStatus == 2
    assert resp.exclusionSummary.firstFailureCounts.distance == 5


def test_shared_eligibility_test_vectors() -> None:
    """Load and validate canonical cross-language test vectors (AD-11)."""
    # packages/contracts/test-vectors/eligibility.json is located relative to repository root
    vectors_path = (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "contracts"
        / "test-vectors"
        / "eligibility.json"
    )
    assert vectors_path.is_file(), f"Test vectors file not found at: {vectors_path}"

    with open(vectors_path, encoding="utf-8") as f:
        data = json.load(f)

    assert data["version"] == "1.0.0"
    vectors = data["vectors"]
    assert len(vectors) >= 10

    seen_stages: set[str] = set()
    for v in vectors:
        assert "id" in v
        assert "stage" in v
        seen_stages.add(v["stage"])

        expected_code = v.get("expectedExclusionCode")
        if expected_code is not None:
            # Must be a valid ExclusionCode enum value
            assert expected_code in [e.value for e in ExclusionCode]
        else:
            assert v["expectedEligible"] is True

    # Assert all canonical stages E1-E7 plus ELIGIBLE are tested
    for i in range(1, 8):
        assert f"E{i}" in seen_stages, f"Stage E{i} missing in test vectors"
    assert "ELIGIBLE" in seen_stages

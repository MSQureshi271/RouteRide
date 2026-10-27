"""Tests for Structured Matching Decision Metrics & Zero-PII Telemetry (Task 1.10b).

Validates:
1. Canonical AD-11 first-failure OpenTelemetry metric emission across stages E1..E7.
2. Production of exactly ONE structured log event per search (matching.search.decision).
3. Zero-PII enforcement: no coordinates, rider names, phone numbers, or addresses in logs.
4. Dominant failure reason derivation adhering to canonical precedence.
"""

from __future__ import annotations

import json
from unittest.mock import patch
from uuid import UUID

import pytest

from app.matching.observability import record_matching_decision
from app.schemas.internal_search import (
    ExclusionSummary,
    FirstFailureCounts,
    InternalCandidateMatch,
    InternalSearchRequest,
    InternalSearchResponse,
    ScoreBreakdown,
)

TEST_RIDER_ID = UUID("11111111-1111-4111-8111-111111111111")
DRIVER_1_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


def make_request(
    sub_type: str = "ONE_WAY",
    day: int = 1,
    time_str: str = "08:00",
) -> InternalSearchRequest:
    return InternalSearchRequest(
        riderId=TEST_RIDER_ID,
        pickupLat=24.8600,
        pickupLng=67.0100,
        destLat=24.9200,
        destLng=67.1100,
        day=day,
        departureTime=time_str,
        subscriptionType=sub_type,  # type: ignore[arg-type]
        pickupRadiusMeters=1500.0,
        destRadiusMeters=2000.0,
    )


def make_response(
    eligible_count: int = 1,
    failure_counts: FirstFailureCounts | None = None,
    execution_time_ms: float = 45.2,
) -> InternalSearchResponse:
    if failure_counts is None:
        failure_counts = FirstFailureCounts(
            driverStatus=2,
            invalidGeometry=0,
            distance=10,
            direction=3,
            operatingDay=1,
            capacity=2,
            timing=1,
        )

    results: list[InternalCandidateMatch] = []
    if eligible_count > 0:
        results.append(
            InternalCandidateMatch(
                driverProfileId=DRIVER_1_ID,
                compositeScore=0.885,
                scoreBreakdown=ScoreBreakdown(
                    proximityScore=0.9,
                    timingScore=0.85,
                    ratingScore=0.8,
                    capacityScore=1.0,
                    acceptanceScore=0.85,
                ),
                pickupDistanceMeters=200.0,
                destDistanceMeters=350.0,
                estimatedTripDurationMinutes=25.0,
                availableSeats=3,
                avgRating=4.8,
                reviewCount=15,
            )
        )

    total_eval = (
        failure_counts.driverStatus
        + failure_counts.invalidGeometry
        + failure_counts.distance
        + failure_counts.direction
        + failure_counts.operatingDay
        + failure_counts.capacity
        + failure_counts.timing
        + eligible_count
    )

    return InternalSearchResponse(
        results=results,
        totalCandidatesEvaluated=total_eval,
        totalEligible=eligible_count,
        exclusionSummary=ExclusionSummary(firstFailureCounts=failure_counts),
        meta={
            "executionTimeMs": execution_time_ms,
            "searchTimestamp": "2026-10-08T12:00:00Z",
        },
    )


def test_record_matching_decision_otel_metrics() -> None:
    """Verify that OpenTelemetry counters and histograms are updated accurately."""
    req = make_request()
    resp = make_response(eligible_count=1)

    with (
        patch("app.matching.observability.search_requests_counter.add") as mock_req_add,
        patch("app.matching.observability.search_duration_histogram.record") as mock_dur_rec,
        patch("app.matching.observability.candidates_evaluated_histogram.record") as mock_eval_rec,
        patch("app.matching.observability.candidates_eligible_histogram.record") as mock_elig_rec,
        patch("app.matching.observability.first_failure_exclusions_counter.add") as mock_excl_add,
    ):
        record_matching_decision(req, resp)

        mock_req_add.assert_called_once_with(
            1, {"subscription_type": "ONE_WAY", "has_matches": "true"}
        )
        mock_dur_rec.assert_called_once_with(45.2, {"subscription_type": "ONE_WAY"})
        mock_eval_rec.assert_called_once_with(
            resp.totalCandidatesEvaluated, {"subscription_type": "ONE_WAY"}
        )
        mock_elig_rec.assert_called_once_with(1, {"subscription_type": "ONE_WAY"})

        # First failure exclusions should be called for non-zero counts
        # (driverStatus: 2, distance: 10, direction: 3, operatingDay: 1, capacity: 2, timing: 1) = 6 calls
        assert mock_excl_add.call_count == 6


def test_record_matching_decision_emits_single_log_event_and_zero_pii(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verify exactly ONE structured log event is emitted and absolutely NO PII is leaked."""
    req = make_request()
    counts = FirstFailureCounts(
        driverStatus=0,
        invalidGeometry=0,
        distance=50,  # Dominant failure
        direction=5,
        operatingDay=2,
        capacity=1,
        timing=0,
    )
    resp = make_response(eligible_count=0, failure_counts=counts)

    capsys.readouterr()  # Flush stdout
    record_matching_decision(req, resp)
    captured = capsys.readouterr().out.strip().splitlines()

    decision_events = [
        json.loads(line)
        for line in captured
        if '"matching.search.decision"' in line
    ]

    assert len(decision_events) == 1, f"Expected exactly 1 log event, got {len(decision_events)}"
    event = decision_events[0]

    assert event["event"] == "matching.search.decision"
    assert event["subscription_type"] == "ONE_WAY"
    assert event["day"] == 1
    assert event["departure_time"] == "08:00"
    assert event["dominant_failure_reason"] == "DISTANCE"
    assert event["total_eligible"] == 0
    assert event["results_count"] == 0
    assert event["first_failure_counts"]["distance"] == 50

    # ZERO-PII GUARANTEE
    forbidden_terms = [
        "pickup_lat",
        "pickup_lng",
        "dest_lat",
        "dest_lng",
        "lat",
        "lng",
        "latitude",
        "longitude",
        "name",
        "phone",
        "address",
        "rider_name",
    ]
    for key in event:
        for forbidden in forbidden_terms:
            assert key.lower() != forbidden, f"PII key detected in event: {key}"

    # Also verify event values do not contain raw coordinate numbers
    log_str = str(event)
    assert "24.86" not in log_str
    assert "67.01" not in log_str
    assert "24.92" not in log_str
    assert "67.11" not in log_str


def test_dominant_failure_reason_precedence(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verify dominant failure reason accurately identifies the maximum first-failure stage."""
    req = make_request()

    # Case 1: Capacity is dominant
    counts1 = FirstFailureCounts(
        driverStatus=1,
        invalidGeometry=0,
        distance=3,
        direction=2,
        operatingDay=0,
        capacity=12,  # Max
        timing=4,
    )
    resp1 = make_response(eligible_count=0, failure_counts=counts1)
    capsys.readouterr()
    record_matching_decision(req, resp1)
    captured1 = [
        json.loads(line)
        for line in capsys.readouterr().out.strip().splitlines()
        if '"matching.search.decision"' in line
    ]
    assert len(captured1) == 1
    assert captured1[0]["dominant_failure_reason"] == "CAPACITY"

    # Case 2: Timing is dominant
    counts2 = FirstFailureCounts(
        driverStatus=0,
        invalidGeometry=0,
        distance=1,
        direction=0,
        operatingDay=0,
        capacity=0,
        timing=8,  # Max
    )
    resp2 = make_response(eligible_count=0, failure_counts=counts2)
    capsys.readouterr()
    record_matching_decision(req, resp2)
    captured2 = [
        json.loads(line)
        for line in capsys.readouterr().out.strip().splitlines()
        if '"matching.search.decision"' in line
    ]
    assert len(captured2) == 1
    assert captured2[0]["dominant_failure_reason"] == "TIMING"

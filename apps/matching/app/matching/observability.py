"""Structured matching decision metrics & zero-PII telemetry (Phase 1A Task 1.10b).

Emits:
 1. OpenTelemetry metrics mapping to canonical AD-11 first-failure steps:
    - matching.search.requests (Counter: total searches executed, labeled by subscription_type and has_matches)
    - matching.first_failure.exclusions (Counter: candidate exclusions by stage E1..E7 and reason)
    - matching.search.duration_ms (Histogram: search duration distribution)
    - matching.candidates.evaluated (Histogram: candidate pool size)
    - matching.candidates.eligible (Histogram: eligible candidate count)
 2. Exactly ONE structured log event per search (matching.search.decision):
    - Zero PII emitted (no raw coordinates, no rider names, phone numbers, or addresses)
    - Maps directly to AD-11 first-failure steps and dominant rejection reason
"""

from __future__ import annotations

import structlog
from opentelemetry import metrics

from app.schemas.internal_search import InternalSearchRequest, InternalSearchResponse

logger = structlog.get_logger("routeride.matching")
meter = metrics.get_meter("routeride.matching")

discovery_requests = meter.create_counter("matching.discovery.requests", unit="1")
discovery_duration = meter.create_histogram("matching.discovery.duration_ms", unit="ms")
feasibility_decisions = meter.create_counter("matching.feasibility.decisions", unit="1")


def record_discovery_decision(subscription_type: str, *, total: int, route_free: int, duration_ms: float) -> None:
    """Record available supply without treating low recommendation fit as exclusion."""
    attributes: dict[str, str | bool] = {"subscription_type": subscription_type, "has_matches": total > 0}
    discovery_requests.add(1, attributes)
    discovery_duration.record(duration_ms, {"subscription_type": subscription_type})
    logger.info("matching.discovery.decision", subscription_type=subscription_type,
                total_available=total, route_free_count=route_free, duration_ms=duration_ms)


def record_feasibility_decision(status: str, reason: str | None) -> None:
    """Only bounded outcome/reason labels; no rider, route or location identifiers."""
    feasibility_decisions.add(1, {"status": status, "reason": reason or "NONE"})
    logger.info("matching.feasibility.decision", status=status, reason=reason)

search_requests_counter = meter.create_counter(
    "matching.search.requests",
    unit="1",
    description="Total internal matching search requests executed",
)
first_failure_exclusions_counter = meter.create_counter(
    "matching.first_failure.exclusions",
    unit="1",
    description="Total candidate exclusions partitioned by first-failure stage (AD-11)",
)
search_duration_histogram = meter.create_histogram(
    "matching.search.duration_ms",
    unit="ms",
    description="Matching pipeline execution time in milliseconds",
)
candidates_evaluated_histogram = meter.create_histogram(
    "matching.candidates.evaluated",
    unit="1",
    description="Total candidates evaluated per search request",
)
candidates_eligible_histogram = meter.create_histogram(
    "matching.candidates.eligible",
    unit="1",
    description="Total eligible candidates discovered per search request",
)


def record_matching_decision(
    request: InternalSearchRequest,
    response: InternalSearchResponse,
) -> None:
    """Record OpenTelemetry metrics and emit exactly one zero-PII structured log event (AD-11)."""
    has_matches = len(response.results) > 0
    sub_type = request.subscriptionType
    duration_ms = float(response.meta.get("executionTimeMs", 0.0))

    # 1. OpenTelemetry metrics
    search_requests_counter.add(
        1,
        {"subscription_type": sub_type, "has_matches": str(has_matches).lower()},
    )
    search_duration_histogram.record(duration_ms, {"subscription_type": sub_type})
    candidates_evaluated_histogram.record(
        response.totalCandidatesEvaluated, {"subscription_type": sub_type}
    )
    candidates_eligible_histogram.record(
        response.totalEligible, {"subscription_type": sub_type}
    )

    counts = response.exclusionSummary.firstFailureCounts
    stage_breakdown = [
        ("E1", "DRIVER_STATUS", counts.driverStatus),
        ("E2", "GEOMETRY", counts.invalidGeometry),
        ("E3", "DISTANCE", counts.distance),
        ("E4", "DIRECTION", counts.direction),
        ("E5", "OPERATING_DAY", counts.operatingDay),
        ("E6", "CAPACITY", counts.capacity),
        ("E7", "TIMING", counts.timing),
    ]

    for stage, reason, val in stage_breakdown:
        if val > 0:
            first_failure_exclusions_counter.add(
                val, {"stage": stage, "reason": reason}
            )

    # 2. Dominant failure reason determination
    dominant_reason = None
    max_count = 0
    # Evaluate in canonical E1 -> E7 precedence order
    for _, reason, count in stage_breakdown:
        if count > max_count:
            max_count = count
            dominant_reason = reason

    top_score = (
        response.results[0].compositeScore if response.results else None
    )

    # 3. Emit exactly ONE structured log event (ZERO PII: no coordinates, names, phones, addresses)
    logger.info(
        "matching.search.decision",
        subscription_type=sub_type,
        day=request.day,
        departure_time=request.departureTime,
        total_candidates_evaluated=response.totalCandidatesEvaluated,
        total_eligible=response.totalEligible,
        dominant_failure_reason=dominant_reason,
        first_failure_counts={
            "driverStatus": counts.driverStatus,
            "invalidGeometry": counts.invalidGeometry,
            "distance": counts.distance,
            "direction": counts.direction,
            "operatingDay": counts.operatingDay,
            "capacity": counts.capacity,
            "timing": counts.timing,
        },
        results_count=len(response.results),
        top_composite_score=top_score,
        execution_time_ms=duration_ms,
    )

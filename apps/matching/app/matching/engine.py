"""RouteRide Matching Engine — Core Pipeline Orchestrator (Phase 1A Task 1.09).

Orchestrates canonical matching pipeline stages (AD-11, AD-14, TRD §4.1):
  E1: Driver status (APPROVED)
  E2: Defensive geometry validity (NULL -> EMPTY -> WRONG_SRID -> NON_SIMPLE -> INVALID)
  E3: Spatial corridor proximity (ST_DWithin pickup and destination)
  E4: Direction check (Outbound: pos_pickup < pos_dest; Return: pos_pickup > pos_dest; ROUND_TRIP: both)
  E5: Operating day array overlap
  E6: Capacity headroom (COUNT(DISTINCT active_subscriptions) + 1 <= seat_capacity)
  E7: Timing conflict check (no conflicting committed schedule slots)
  E8: Multi-component scoring & deterministic ranking

Strict Invariant (AD-11 First-Failure Precedence):
  - E6 (Capacity) is evaluated strictly before E7 (Timing).
  - Candidates failing capacity are attributed to 'CAPACITY' and never reach E7.
  - Candidates passing capacity but conflicting on committed slots are attributed to 'TIMING'.
  - Mutually exclusive firstFailureCounts and totalEligible sum to total evaluated candidates.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from uuid import UUID

import asyncpg

from app.config import settings
from app.maps.duration import calculate_haversine_duration_minutes
from app.matching.candidates import (
    CandidateDriver,
    count_spatial_exclusions,
    find_spatial_candidates,
)
from app.matching.capacity import (
    CapacityCheckResult,
    count_overlapping_active_subscriptions,
    evaluate_candidate_capacity,
)
from app.matching.direction import filter_candidates_by_direction
from app.matching.observability import record_matching_decision
from app.matching.scoring import score_and_rank_candidates
from app.matching.service_window import build_requested_service_windows
from app.matching.timing import filter_candidates_by_timing
from app.schemas.internal_search import (
    ExclusionSummary,
    FirstFailureCounts,
    InternalCandidateMatch,
    InternalSearchRequest,
    InternalSearchResponse,
)


async def execute_search(
    conn_or_pool: asyncpg.Pool | asyncpg.Connection,
    request: InternalSearchRequest,
) -> InternalSearchResponse:
    """Execute end-to-end route matching query according to canonical AD-11 rules."""
    start_ns = time.perf_counter_ns()
    timestamp_iso = datetime.now(UTC).isoformat()

    # 1. Pre-computation: Compute canonical service window(s) (AD-10, AD-13, AD-14)
    service_window = build_requested_service_windows(
        request,
        buffer_minutes=settings.MATCHING_TIME_BUFFER_MINUTES,
        city_speed_kmh=settings.MATCHING_CITY_SPEED_KMH,
        min_leg_gap_minutes=settings.ROUND_TRIP_MIN_LEG_GAP_MINUTES,
    )

    # 2 & 3. Database candidate retrieval and global spatial diagnostics (concurrent on pool)
    if isinstance(conn_or_pool, asyncpg.Pool):
        spatial_candidates, spatial_diagnostics = await asyncio.gather(
            find_spatial_candidates(conn_or_pool, request),
            count_spatial_exclusions(conn_or_pool, request),
        )
    else:
        spatial_candidates = await find_spatial_candidates(conn_or_pool, request)
        spatial_diagnostics = await count_spatial_exclusions(conn_or_pool, request)

    # 4. Stage E4: Direction projection filter along transit corridor (AD-9)
    direction_eligible, direction_excluded = filter_candidates_by_direction(
        spatial_candidates,
        request,
    )

    # 5. Stage E6: Capacity headroom filter (AD-10, AD-11)
    # Strictly evaluated before E7 to guarantee canonical first-failure precedence
    candidate_ids = [c.driver_profile_id for c in direction_eligible]
    counts = await count_overlapping_active_subscriptions(
        conn_or_pool,
        candidate_ids,
        request.day,
        service_window,
    )
    capacity_eligible: list[CandidateDriver] = []
    capacity_excluded: list[tuple[CandidateDriver, CapacityCheckResult]] = []
    capacity_results: dict[UUID, CapacityCheckResult] = {}

    for candidate in direction_eligible:
        active_count = counts.get(candidate.driver_profile_id, 0)
        res = evaluate_candidate_capacity(candidate, active_count)
        if res.is_eligible:
            capacity_eligible.append(candidate)
            capacity_results[candidate.driver_profile_id] = res
        else:
            capacity_excluded.append((candidate, res))

    # 6. Stage E7: Timing conflict filter on committed slots (AD-7, AD-11)
    # Evaluated strictly on candidates that survived E6
    timing_eligible, timing_excluded = await filter_candidates_by_timing(
        conn_or_pool,
        capacity_eligible,
        request.day,
        service_window,
        gap_minutes=settings.MATCHING_SLOT_GAP_MINUTES,
    )

    # 7. Stage E8: 5-component scoring & deterministic ranking (PRD §7.4, AD-8)
    scored_matches = score_and_rank_candidates(
        timing_eligible,
        capacity_results,
        request,
        limit=settings.MATCHING_MAX_RESULTS,
    )

    # 8. Display enrichment: Haversine trip duration (AD-3, AD-14)
    trip_duration_min = calculate_haversine_duration_minutes(
        request.pickupLat,
        request.pickupLng,
        request.destLat,
        request.destLng,
        city_speed_kmh=settings.MATCHING_CITY_SPEED_KMH,
    )

    # 9. Result construction
    results: list[InternalCandidateMatch] = [
        InternalCandidateMatch(
            driverProfileId=m.driver_profile_id,
            compositeScore=round(m.composite_score_exact, 4),
            scoreBreakdown=m.score_breakdown,
            pickupDistanceMeters=round(m.pickup_distance_meters, 2),
            destDistanceMeters=round(m.dest_distance_meters, 2),
            estimatedTripDurationMinutes=trip_duration_min,
            availableSeats=m.available_seats,
            avgRating=m.avg_rating,
            reviewCount=m.review_count,
        )
        for m in scored_matches
    ]

    # 10. Aggregated canonical first failure counts (AD-11)
    first_failure_counts = FirstFailureCounts(
        driverStatus=spatial_diagnostics.driver_status_failures,
        invalidGeometry=spatial_diagnostics.invalid_geometry_failures,
        distance=spatial_diagnostics.distance_failures,
        direction=spatial_diagnostics.direction_failures,
        operatingDay=spatial_diagnostics.operating_day_failures,
        capacity=len(capacity_excluded),
        timing=len(timing_excluded),
    )

    total_eligible = len(timing_eligible)
    total_evaluated = (
        first_failure_counts.driverStatus
        + first_failure_counts.invalidGeometry
        + first_failure_counts.distance
        + first_failure_counts.direction
        + first_failure_counts.operatingDay
        + first_failure_counts.capacity
        + first_failure_counts.timing
        + total_eligible
    )

    elapsed_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000.0, 3)

    response = InternalSearchResponse(
        results=results,
        totalCandidatesEvaluated=total_evaluated,
        totalEligible=total_eligible,
        exclusionSummary=ExclusionSummary(firstFailureCounts=first_failure_counts),
        meta={
            "executionTimeMs": elapsed_ms,
            "searchTimestamp": timestamp_iso,
        },
    )

    record_matching_decision(request, response)
    return response

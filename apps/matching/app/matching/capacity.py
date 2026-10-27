"""Capacity check with distinct subscription accounting (Phase 1A Task 1.04).

Implements Stage E6 (Capacity Check) of canonical eligibility (AD-10, AD-11, AD-13):
1. Service window construction with deterministic Haversine duration (25 km/h) and 15m buffer.
2. Invariant validations (AD-13):
   - Cross-midnight intervals rejected with HTTP 400 INVALID_SERVICE_INTERVAL.
   - ROUND_TRIP overlapping legs rejected with HTTP 400 INVALID_ROUND_TRIP_TIMES.
   - Configurable minimum leg gap: departure_end + ROUND_TRIP_MIN_LEG_GAP_MINUTES <= pickup_start.
3. Decoupled seat capacity accounting:
   - Evaluated against active subscriptions (subscriptions.status = 'ACTIVE').
   - Day-aware: operates only on requested operating day ($day = ANY(dss.operating_days)).
   - Distinct accounting: E6 counts a subscription once if at least one of its schedule
     slots for the requested operating day overlaps at least one requested service window.
   - ROUND_TRIP subscriptions occupying multiple schedule slots collapse to exactly 1 seat
     via COUNT(DISTINCT s.id).
   - PENDING subscriptions do not consume seats; PAUSED/CANCELLED subscriptions free seats.
4. Capacity eligibility rule:
   - available_seats = seat_capacity - overlapping_active_subscriptions
   - eligible iff available_seats >= 1; otherwise excluded with code 'CAPACITY'.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from uuid import UUID

import asyncpg
import structlog

from app.maps.duration import (
    DEFAULT_CITY_SPEED_KMH,
    DEFAULT_DETOUR_FACTOR,
    calculate_haversine_duration_minutes,
)
from app.matching.candidates import CandidateDriver
from app.matching.service_window import (
    DEFAULT_BUFFER_MINUTES,
    DEFAULT_MIN_LEG_GAP_MINUTES,
    MINUTES_PER_DAY,
    InvalidRoundTripTimesError,
    InvalidServiceIntervalError,
    RequestedServiceWindow,
    build_requested_service_windows,
    minutes_to_time,
    time_str_to_minutes,
)
from app.schemas.internal_search import InternalSearchRequest

logger = structlog.get_logger(service="routeride-matching")

__all__ = [
    "CapacityCheckResult",
    "DEFAULT_BUFFER_MINUTES",
    "DEFAULT_CITY_SPEED_KMH",
    "DEFAULT_DETOUR_FACTOR",
    "DEFAULT_MIN_LEG_GAP_MINUTES",
    "InvalidRoundTripTimesError",
    "InvalidServiceIntervalError",
    "MINUTES_PER_DAY",
    "RequestedServiceWindow",
    "build_requested_service_windows",
    "calculate_haversine_duration_minutes",
    "count_overlapping_active_subscriptions",
    "evaluate_candidate_capacity",
    "filter_candidates_by_capacity",
    "minutes_to_time",
    "time_str_to_minutes",
]


@dataclass(frozen=True, slots=True)
class CapacityCheckResult:
    """Detailed capacity evaluation result for a candidate driver."""

    driver_profile_id: UUID
    seat_capacity: int
    overlapping_active_subscriptions: int
    available_seats: int
    is_eligible: bool
    exclusion_reason: str | None = None  # None if eligible, "CAPACITY" if excluded


CAPACITY_OVERLAP_QUERY = """
SELECT
  s.driver_profile_id,
  COUNT(DISTINCT s.id)::int AS overlapping_active_subscriptions
FROM subscriptions s
JOIN driver_schedule_slots dss ON dss.subscription_id = s.id
WHERE s.driver_profile_id = ANY($1::text[])
  AND s.status = 'ACTIVE'
  AND $2 = ANY(dss.operating_days)
  AND (
    ($3::boolean AND dss.slot_start < $5::time AND dss.slot_end > $4::time)
    OR
    ($6::boolean AND dss.slot_start < $8::time AND dss.slot_end > $7::time)
  )
GROUP BY s.driver_profile_id;
"""


async def count_overlapping_active_subscriptions(
    conn_or_pool: asyncpg.Pool | asyncpg.Connection,
    candidate_ids: list[UUID],
    day: int,
    window: RequestedServiceWindow,
) -> dict[UUID, int]:
    """Execute batch capacity query returning active subscription count per driver (AD-10).

    Canonically enforces:
    1. Status isolation: only s.status = 'ACTIVE' rows count.
    2. Operating day isolation: $day = ANY(dss.operating_days).
    3. Distinct subscription accounting: COUNT(DISTINCT s.id) ensures a multi-slot
       subscription (such as ROUND_TRIP) is counted exactly once regardless of whether
       one or both legs overlap.
    """
    if not candidate_ids:
        return {}

    dummy_time = time(0, 0)
    departure_start = window.departure_start or dummy_time
    departure_end = window.departure_end or dummy_time
    pickup_start = window.pickup_start or dummy_time
    pickup_end = window.pickup_end or dummy_time

    candidate_id_strs = [str(cid) for cid in candidate_ids]

    rows = await conn_or_pool.fetch(
        CAPACITY_OVERLAP_QUERY,
        candidate_id_strs,
        day,
        window.has_departure_leg,
        departure_start,
        departure_end,
        window.has_pickup_leg,
        pickup_start,
        pickup_end,
    )

    return {
        UUID(str(r["driver_profile_id"])): int(r["overlapping_active_subscriptions"]) for r in rows
    }


def evaluate_candidate_capacity(
    candidate: CandidateDriver,
    overlapping_active_count: int,
) -> CapacityCheckResult:
    """Evaluate candidate capacity headroom against requested commute."""
    available_seats = candidate.seat_capacity - overlapping_active_count
    is_eligible = available_seats >= 1

    return CapacityCheckResult(
        driver_profile_id=candidate.driver_profile_id,
        seat_capacity=candidate.seat_capacity,
        overlapping_active_subscriptions=overlapping_active_count,
        available_seats=available_seats,
        is_eligible=is_eligible,
        exclusion_reason=None if is_eligible else "CAPACITY",
    )


async def filter_candidates_by_capacity(
    conn_or_pool: asyncpg.Pool | asyncpg.Connection,
    candidates: list[CandidateDriver],
    request: InternalSearchRequest,
    buffer_minutes: int | None = None,
    city_speed_kmh: float | None = None,
    min_leg_gap_minutes: int | None = None,
    service_window: RequestedServiceWindow | None = None,
) -> tuple[list[CandidateDriver], list[tuple[CandidateDriver, CapacityCheckResult]]]:
    """Filter candidate drivers through Stage E6 (Capacity Check).

    Returns:
      tuple of (eligible_candidates, list_of_tuples(excluded_candidate, capacity_result))
    """
    if not candidates:
        return [], []

    window = (
        service_window
        if service_window is not None
        else build_requested_service_windows(
            request,
            buffer_minutes=buffer_minutes,
            city_speed_kmh=city_speed_kmh,
            min_leg_gap_minutes=min_leg_gap_minutes,
        )
    )

    candidate_ids = [c.driver_profile_id for c in candidates]
    counts = await count_overlapping_active_subscriptions(
        conn_or_pool,
        candidate_ids,
        request.day,
        window,
    )

    eligible: list[CandidateDriver] = []
    excluded: list[tuple[CandidateDriver, CapacityCheckResult]] = []

    for candidate in candidates:
        active_count = counts.get(candidate.driver_profile_id, 0)
        res = evaluate_candidate_capacity(candidate, active_count)
        if res.is_eligible:
            eligible.append(candidate)
        else:
            excluded.append((candidate, res))
            logger.debug(
                "matching.excluded.capacity",
                driver_id=str(candidate.driver_profile_id),
                seat_capacity=candidate.seat_capacity,
                overlapping_active_subscriptions=res.overlapping_active_subscriptions,
                available_seats=res.available_seats,
                exclusion_reason="CAPACITY",
            )

    return eligible, excluded

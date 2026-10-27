"""Timing conflict check and interval overlap evaluation (Phase 1A Task 1.05).

Implements Stage E7 (Timing Conflict Check) of canonical eligibility (AD-10, AD-11, AD-13, AD-14):
1. Service window input:
   - Receives pre-validated RequestedServiceWindow (single source of truth from service_window.py).
   - Never re-constructs or re-validates service windows.
2. Canonical interval conflict formula (AD-7, TRD §4.1, SPEC-DELTA-mvp §B4):
   Two intervals conflict if and only if:
     (slot_start_min < window_end_min + gap) AND (slot_end_min + gap > window_start_min)
   - Evaluated as minute-of-day integer comparisons in both SQL and Python.
   - Eliminates all 24:00 time wrap-around edge cases.
   - Touching windows (e.g. 08:00–08:30 and 08:30–09:00) satisfy 510 > 510 = False with
     gap = 0 and do NOT conflict (AD-7).
3. Dual-window evaluation for ROUND_TRIP:
   - Candidate driver must have zero conflicting schedule slots across both legs.
   - Any conflict on either leg excludes the candidate with code 'TIMING'.
4. Database query:
   - Queried against driver_schedule_slots table.
   - Matches driver_profile_id = ANY($1::uuid[]::text[]) using list[UUID] input,
     enforcing database-level UUID validation while retaining B-tree index scan.
   - Filters on requested operating day ($day = ANY(dss.operating_days)).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import time
from uuid import UUID

import asyncpg
import structlog

from app.config import settings
from app.matching.candidates import CandidateDriver
from app.matching.service_window import RequestedServiceWindow

logger = structlog.get_logger(service="routeride-matching")

__all__ = [
    "ConflictingSlot",
    "TimingCheckResult",
    "evaluate_candidate_timing",
    "filter_candidates_by_timing",
    "find_conflicting_schedule_slots",
    "has_interval_conflict",
]


@dataclass(frozen=True, slots=True)
class ConflictingSlot:
    """Represents an existing driver schedule slot that conflicts with the requested service window."""

    id: UUID
    driver_profile_id: UUID
    subscription_id: UUID
    leg_type: str
    slot_start: time
    slot_end: time
    slot_start_min: int
    slot_end_min: int
    operating_days: list[int]
    pickup_order: int


@dataclass(frozen=True, slots=True)
class TimingCheckResult:
    """Detailed E7 timing evaluation result for a candidate driver."""

    driver_profile_id: UUID
    conflicting_slots_count: int
    is_eligible: bool
    conflicting_slots: list[ConflictingSlot] = field(default_factory=list)
    exclusion_reason: str | None = None  # None if eligible, "TIMING" if excluded


def has_interval_conflict(
    slot_start_min: int,
    slot_end_min: int,
    window_start_min: int,
    window_end_min: int,
    gap_minutes: int = 0,
) -> bool:
    """Canonical interval conflict check (AD-7, AD-11, AD-13).

    Conflict iff: (slot_start_min < window_end_min + gap) and (slot_end_min + gap > window_start_min)

    With gap = 0, touching intervals (e.g. 08:00-08:30 and 08:30-09:00, or 480-510 and 510-540)
    satisfy 510 > 510 = False and do NOT conflict.
    """
    return (slot_start_min < window_end_min + gap_minutes) and (
        slot_end_min + gap_minutes > window_start_min
    )


TIMING_CONFLICT_QUERY = """
SELECT
  dss.id,
  dss.driver_profile_id,
  dss.subscription_id,
  dss.leg_type,
  dss.slot_start,
  dss.slot_end,
  (EXTRACT(EPOCH FROM dss.slot_start)::int / 60) AS slot_start_min,
  (EXTRACT(EPOCH FROM dss.slot_end)::int / 60) AS slot_end_min,
  dss.operating_days,
  dss.pickup_order
FROM driver_schedule_slots dss
WHERE dss.driver_profile_id = ANY($1::uuid[]::text[])
  AND $2 = ANY(dss.operating_days)
  AND (
    (
      $3::boolean
      AND (EXTRACT(EPOCH FROM dss.slot_start)::int / 60) < ($5::int + $9::int)
      AND ((EXTRACT(EPOCH FROM dss.slot_end)::int / 60) + $9::int) > $4::int
    )
    OR
    (
      $6::boolean
      AND (EXTRACT(EPOCH FROM dss.slot_start)::int / 60) < ($8::int + $9::int)
      AND ((EXTRACT(EPOCH FROM dss.slot_end)::int / 60) + $9::int) > $7::int
    )
  );
"""


async def find_conflicting_schedule_slots(
    conn_or_pool: asyncpg.Pool | asyncpg.Connection,
    driver_ids: list[UUID],
    day: int,
    window: RequestedServiceWindow,
    gap_minutes: int | None = None,
) -> dict[UUID, list[ConflictingSlot]]:
    """Batch query driver_schedule_slots for temporal conflicts against requested service window(s).

    Parameters:
      conn_or_pool: Active database connection or connection pool.
      driver_ids: Candidate driver profile UUIDs to check.
      day: Requested operating day of week (0=Sunday, 1=Monday, ..., 6=Saturday).
      window: Pre-validated RequestedServiceWindow from service_window.py.
      gap_minutes: Optional buffer gap between adjacent slots (defaults to settings.MATCHING_SLOT_GAP_MINUTES).

    Returns:
      Dictionary mapping driver_profile_id -> list of ConflictingSlot instances.
    """
    if not driver_ids:
        return {}

    gap = gap_minutes if gap_minutes is not None else settings.MATCHING_SLOT_GAP_MINUTES

    departure_start = window.get_departure_start_min() or 0
    departure_end = window.get_departure_end_min() or 0
    pickup_start = window.get_pickup_start_min() or 0
    pickup_end = window.get_pickup_end_min() or 0

    rows = await conn_or_pool.fetch(
        TIMING_CONFLICT_QUERY,
        driver_ids,
        day,
        window.has_departure_leg,
        departure_start,
        departure_end,
        window.has_pickup_leg,
        pickup_start,
        pickup_end,
        gap,
    )

    conflicts_by_driver: dict[UUID, list[ConflictingSlot]] = {d_id: [] for d_id in driver_ids}

    for row in rows:
        d_id = UUID(row["driver_profile_id"])
        slot = ConflictingSlot(
            id=UUID(row["id"]),
            driver_profile_id=d_id,
            subscription_id=UUID(row["subscription_id"]),
            leg_type=row["leg_type"],
            slot_start=row["slot_start"],
            slot_end=row["slot_end"],
            slot_start_min=int(row["slot_start_min"]),
            slot_end_min=int(row["slot_end_min"]),
            operating_days=list(row["operating_days"]),
            pickup_order=int(row["pickup_order"]),
        )
        if d_id in conflicts_by_driver:
            conflicts_by_driver[d_id].append(slot)

    return conflicts_by_driver


def evaluate_candidate_timing(
    candidate: CandidateDriver,
    conflicts: list[ConflictingSlot],
) -> TimingCheckResult:
    """Evaluate E7 timing eligibility for a single candidate driver.

    Rule:
      eligible iff conflicting_slots == 0; otherwise excluded with reason 'TIMING'.
    """
    is_eligible = len(conflicts) == 0

    return TimingCheckResult(
        driver_profile_id=candidate.driver_profile_id,
        conflicting_slots_count=len(conflicts),
        is_eligible=is_eligible,
        conflicting_slots=conflicts,
        exclusion_reason=None if is_eligible else "TIMING",
    )


async def filter_candidates_by_timing(
    conn_or_pool: asyncpg.Pool | asyncpg.Connection,
    candidates: list[CandidateDriver],
    day: int,
    window: RequestedServiceWindow,
    gap_minutes: int | None = None,
) -> tuple[list[CandidateDriver], list[tuple[CandidateDriver, TimingCheckResult]]]:
    """Filter candidate drivers through Stage E7 (Timing Conflict Check).

    Parameters:
      conn_or_pool: Active database connection or connection pool.
      candidates: List of candidate drivers that survived Stages E1–E6.
      day: Requested operating day of week (0..6).
      window: Pre-validated RequestedServiceWindow.
      gap_minutes: Optional buffer minutes (defaults to settings.MATCHING_SLOT_GAP_MINUTES).

    Returns:
      tuple of (eligible_candidates, list_of_tuples(excluded_candidate, timing_result))
    """
    if not candidates:
        return [], []

    candidate_ids = [c.driver_profile_id for c in candidates]
    conflicts_by_driver = await find_conflicting_schedule_slots(
        conn_or_pool,
        candidate_ids,
        day,
        window,
        gap_minutes=gap_minutes,
    )

    eligible: list[CandidateDriver] = []
    excluded: list[tuple[CandidateDriver, TimingCheckResult]] = []

    for candidate in candidates:
        conflicts = conflicts_by_driver.get(candidate.driver_profile_id, [])
        res = evaluate_candidate_timing(candidate, conflicts)
        if res.is_eligible:
            eligible.append(candidate)
        else:
            excluded.append((candidate, res))
            logger.debug(
                "matching.excluded.timing",
                driver_id=str(candidate.driver_profile_id),
                conflicting_slots_count=res.conflicting_slots_count,
                requested_day=day,
                has_departure=window.has_departure_leg,
                has_pickup=window.has_pickup_leg,
                conflicting_slot_ids=[str(s.id) for s in conflicts],
                exclusion_reason="TIMING",
            )

    return eligible, excluded

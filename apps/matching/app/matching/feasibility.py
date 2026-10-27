"""Deterministic, read-only insertion proof preserving existing stop commitments.

Enumerates all pickup-before-dropoff insertions without reordering existing stops.
No optimizer fallback can approve an unproven order. The API must still lock and
revalidate roster/availability/policy/evidence versions before committing.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.maps.road_times import RoadTimeMatrix, RoutingPolicy
from app.matching.observability import record_feasibility_decision


@dataclass(frozen=True)
class Stop:
    id: str
    point_key: str
    rider_key: str
    kind: str
    earliest_minutes: float
    latest_minutes: float


@dataclass(frozen=True)
class LegSnapshot:
    day: int
    leg_type: str
    run_id: str | None
    origin_key: str
    ready_at_minutes: float
    available_until_minutes: float
    seat_capacity: int
    occupied_seats: int
    existing_stops: tuple[Stop, ...]
    new_pickup: Stop
    new_dropoff: Stop
    next_origin_key: str | None = None
    next_ready_minutes: float | None = None


@dataclass(frozen=True)
class RunInsertion:
    day: int
    leg_type: str
    run_id: str | None
    ordered_stop_ids: tuple[str, ...]
    arrival_minutes: tuple[float, ...]


@dataclass(frozen=True)
class FeasibilityResult:
    status: Literal["FEASIBLE", "INFEASIBLE", "UNKNOWN"]
    reason: str | None
    estimate_version: str | None
    policy_version: str
    assignments: tuple[RunInsertion, ...] = ()


def _validate_snapshot(leg: LegSnapshot) -> None:
    stops = (*leg.existing_stops, leg.new_pickup, leg.new_dropoff)
    if (leg.day not in range(7) or leg.leg_type not in ("DEPARTURE", "PICKUP")
            or leg.seat_capacity < 1 or leg.occupied_seats < 0
            or not 0 <= leg.ready_at_minutes < leg.available_until_minutes < 1440
            or len({stop.id for stop in stops}) != len(stops)
            or leg.new_pickup.kind != "PICKUP" or leg.new_dropoff.kind != "DROPOFF"
            or leg.new_pickup.rider_key != leg.new_dropoff.rider_key
            or (leg.next_origin_key is None) != (leg.next_ready_minutes is None)):
        raise ValueError("Invalid run snapshot")
    for stop in stops:
        if (stop.kind not in ("PICKUP", "DROPOFF")
                or not math.isfinite(stop.earliest_minutes) or not math.isfinite(stop.latest_minutes)
                or not 0 <= stop.earliest_minutes <= stop.latest_minutes < 1440):
            raise ValueError("Invalid stop commitment")


def _simulate(
    leg: LegSnapshot, stops: tuple[Stop, ...], matrix: RoadTimeMatrix, policy: RoutingPolicy,
) -> tuple[float, ...] | None:
    current = leg.ready_at_minutes
    origin = leg.origin_key
    picked_up: set[str] = set()
    arrivals: list[float] = []
    for stop in stops:
        seconds = matrix.seconds(origin, stop.point_key)
        if seconds is None:
            return None
        current = max(stop.earliest_minutes, current + seconds * policy.travel_multiplier / 60)
        if current > stop.latest_minutes:
            return None
        if stop.kind == "PICKUP":
            if stop.rider_key in picked_up:
                return None
            picked_up.add(stop.rider_key)
        elif stop.rider_key not in picked_up:
            return None
        else:
            picked_up.remove(stop.rider_key)
        arrivals.append(current)
        current += policy.stop_service_seconds / 60
        origin = stop.point_key
    if picked_up or current > leg.available_until_minutes:
        return None
    if leg.next_origin_key is not None and leg.next_ready_minutes is not None:
        seconds = matrix.seconds(origin, leg.next_origin_key)
        if seconds is None or current + seconds * policy.travel_multiplier / 60 > leg.next_ready_minutes:
            return None
    return tuple(arrivals)


def evaluate_proposal(
    legs: list[LegSnapshot], matrix: RoadTimeMatrix | None,
    policy: RoutingPolicy, now: datetime,
) -> FeasibilityResult:
    """Prove every requested day/leg, returning no partial round-trip assignment."""
    def result(status: Literal["FEASIBLE", "INFEASIBLE", "UNKNOWN"], reason: str | None,
               assignments: tuple[RunInsertion, ...] = ()) -> FeasibilityResult:
        record_feasibility_decision(status, reason)
        return FeasibilityResult(status, reason, matrix.version if matrix else None, policy.version, assignments)

    if not legs or len({(leg.day, leg.leg_type) for leg in legs}) != len(legs):
        raise ValueError("Require distinct day/leg snapshots")
    for leg in legs:
        _validate_snapshot(leg)
    if matrix is None:
        return result("UNKNOWN", "MISSING_ESTIMATE")
    if now.utcoffset() is None:
        raise ValueError("Evaluation timestamp must be timezone-aware")
    age = (now - matrix.estimated_at).total_seconds()
    if age < 0 or age > policy.max_estimate_age_seconds:
        return result("UNKNOWN", "STALE_ESTIMATE")
    deadline = time.monotonic() + policy.timeout_seconds
    assignments: list[RunInsertion] = []
    for leg in legs:
        if leg.occupied_seats + 1 > leg.seat_capacity:
            return result("INFEASIBLE", "CAPACITY")
        # Completeness is required before distinguishing no solution from missing
        # evidence. Checking directed pairs prevents partial matrices approving an
        # insertion by accidentally avoiding unknown routing evidence.
        keys = {leg.origin_key, *(s.point_key for s in leg.existing_stops),
                leg.new_pickup.point_key, leg.new_dropoff.point_key}
        if leg.next_origin_key:
            keys.add(leg.next_origin_key)
        if any(matrix.seconds(a, b) is None for a in keys for b in keys):
            return result("UNKNOWN", "MISSING_ESTIMATE")
        best: RunInsertion | None = None
        for pickup_index in range(len(leg.existing_stops) + 1):
            with_pickup = (*leg.existing_stops[:pickup_index], leg.new_pickup,
                           *leg.existing_stops[pickup_index:])
            for dropoff_index in range(pickup_index + 1, len(with_pickup) + 1):
                if time.monotonic() >= deadline:
                    return result("UNKNOWN", "NO_VALID_INSERTION")
                order = (*with_pickup[:dropoff_index], leg.new_dropoff, *with_pickup[dropoff_index:])
                arrivals = _simulate(leg, order, matrix, policy)
                if arrivals is not None:
                    proposal = RunInsertion(leg.day, leg.leg_type, leg.run_id,
                                            tuple(s.id for s in order), arrivals)
                    if best is None or (arrivals[-1], proposal.ordered_stop_ids) < (best.arrival_minutes[-1], best.ordered_stop_ids):
                        best = proposal
        if best is None:
            return result("INFEASIBLE", "NO_VALID_INSERTION")
        assignments.append(best)
    # Independent leg proofs must also allow the driver to move between runs on
    # the same day. Never approve two individually valid but mutually impossible
    # outbound/return assignments.
    for day in {leg.day for leg in legs}:
        daily = sorted(((leg, assignment) for leg, assignment in zip(legs, assignments, strict=True)
                        if leg.day == day), key=lambda pair: pair[0].ready_at_minutes)
        for (previous, insertion), (following, _) in zip(daily, daily[1:], strict=False):
            previous_stops = {stop.id: stop for stop in (*previous.existing_stops, previous.new_pickup, previous.new_dropoff)}
            last_key = previous_stops[insertion.ordered_stop_ids[-1]].point_key
            transfer = matrix.seconds(last_key, following.origin_key)
            if transfer is None:
                return result("UNKNOWN", "MISSING_ESTIMATE")
            finished = insertion.arrival_minutes[-1] + policy.stop_service_seconds / 60
            if finished + transfer * policy.travel_multiplier / 60 > following.ready_at_minutes:
                return result("INFEASIBLE", "TIMING")
    return result("FEASIBLE", None, tuple(assignments))

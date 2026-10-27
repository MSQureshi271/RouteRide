"""Direction check with corridor model & dual-leg ROUND_TRIP (Phase 1A Task 1.03).

Implements Stage E4 (Direction Check) of canonical eligibility (AD-9, AD-11, B1):
1. Endpoint separation validation: Rejects requests with geodesic distance < 50m
   between pickup and destination with HTTP 422 INVALID_ROUTE_REQUEST.
2. Polyline projection: Uses ST_LineLocatePoint semantics via Shapely line.project
   returning normalized float in [0.0, 1.0].
3. Corridor traversal semantics on canonically oriented polyline (0=origin, 1=destination):
   - DEPARTURE: pos_pickup < pos_dest - 1e-9
   - PICKUP: pos_pickup > pos_dest + 1e-9
   - ROUND_TRIP: pos_pickup < pos_dest - 1e-9 (satisfies both outbound and return legs per B1)
4. Canonical tolerance: POSITION_EPSILON = 1e-9 shared between Python and PostGIS SQL.
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog
from fastapi import HTTPException, status
from shapely.geometry import Point
from shapely.geometry.base import BaseGeometry

from app.maps.duration import haversine_distance_meters
from app.matching.candidates import CandidateDriver
from app.schemas.internal_search import InternalSearchRequest

logger = structlog.get_logger(service="routeride-matching")

POSITION_EPSILON: float = 1e-9
MIN_ENDPOINT_SEPARATION_METERS: float = 50.0

__all__ = [
    "DirectionCheckResult",
    "InvalidRouteRequestError",
    "MIN_ENDPOINT_SEPARATION_METERS",
    "POSITION_EPSILON",
    "evaluate_direction",
    "filter_candidates_by_direction",
    "haversine_distance_meters",
    "project_point_on_route",
    "validate_endpoint_separation",
]


class InvalidRouteRequestError(HTTPException):
    """Exception raised when pickup and destination coordinates are too close (< 50m)."""

    def __init__(
        self,
        message: str = "Pickup and destination points must be separated by at least 50 meters",
    ) -> None:
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "INVALID_ROUTE_REQUEST",
                "message": message,
            },
        )


def validate_endpoint_separation(
    pickup_lat: float,
    pickup_lng: float,
    dest_lat: float,
    dest_lng: float,
    min_meters: float = MIN_ENDPOINT_SEPARATION_METERS,
) -> float:
    """Validate that pickup and destination have at least min_meters separation.

    Raises:
        InvalidRouteRequestError: If geodesic distance < min_meters.

    Returns:
        float: Calculated distance in meters.
    """
    distance = haversine_distance_meters(pickup_lat, pickup_lng, dest_lat, dest_lng)
    if distance < min_meters:
        raise InvalidRouteRequestError(
            f"Pickup and destination points must be separated by at least {min_meters:.0f} meters "
            f"(actual: {distance:.1f}m)"
        )
    return distance


def project_point_on_route(
    route_geometry: BaseGeometry,
    lng: float,
    lat: float,
    point: Point | None = None,
) -> float:
    """Project a point onto route polyline using normalized ST_LineLocatePoint semantics.

    Returns:
        float in [0.0, 1.0] representing the location along the line as a fraction
        of total line length. Returns 0.0 for empty or degenerate 0-length lines.
    """
    if route_geometry.is_empty or route_geometry.length == 0.0:
        return 0.0

    pt = point if point is not None else Point(lng, lat)
    loc = float(route_geometry.project(pt, normalized=True))
    return max(0.0, min(1.0, loc))


@dataclass(frozen=True, slots=True)
class DirectionCheckResult:
    """Outcome of Stage E4 direction evaluation for a driver corridor."""

    is_eligible: bool
    pos_pickup: float
    pos_dest: float
    subscription_type: str
    exclusion_reason: str | None = None  # None if eligible, "DIRECTION" if excluded


def evaluate_direction(
    route_geometry: BaseGeometry,
    pickup_lat: float,
    pickup_lng: float,
    dest_lat: float,
    dest_lng: float,
    subscription_type: str,
    pickup_pt: Point | None = None,
    dest_pt: Point | None = None,
) -> DirectionCheckResult:
    """Evaluate corridor traversal direction (Stage E4) on a canonically oriented polyline.

    Orientation baseline:
      position 0.0 -> outbound origin (neighborhood/home base)
      position 1.0 -> outbound destination (school/work hub)

    Traversal semantics:
      1. Collocated / sub-epsilon difference (< 1e-9): Ineligible (DIRECTION).
      2. DEPARTURE: pos_pickup < pos_dest - 1e-9 (forward outbound travel).
      3. PICKUP: pos_pickup > pos_dest + 1e-9 (reverse return travel).
      4. ROUND_TRIP: pos_pickup < pos_dest - 1e-9 (both outbound and return legs
         satisfied along the undirected corridor per B1 resolution).
    """
    pos_pickup = project_point_on_route(route_geometry, pickup_lng, pickup_lat, point=pickup_pt)
    pos_dest = project_point_on_route(route_geometry, dest_lng, dest_lat, point=dest_pt)

    # 1. Collocated / degenerate projection check
    if abs(pos_pickup - pos_dest) < POSITION_EPSILON:
        return DirectionCheckResult(
            is_eligible=False,
            pos_pickup=pos_pickup,
            pos_dest=pos_dest,
            subscription_type=subscription_type,
            exclusion_reason="DIRECTION",
        )

    # 2. Mode evaluation
    if subscription_type in ("ONE_WAY", "ROUND_TRIP"):
        is_eligible = pos_pickup < (pos_dest - POSITION_EPSILON)
    else:
        is_eligible = False

    return DirectionCheckResult(
        is_eligible=is_eligible,
        pos_pickup=pos_pickup,
        pos_dest=pos_dest,
        subscription_type=subscription_type,
        exclusion_reason=None if is_eligible else "DIRECTION",
    )


def filter_candidates_by_direction(
    candidates: list[CandidateDriver],
    request: InternalSearchRequest,
) -> tuple[list[CandidateDriver], list[tuple[CandidateDriver, DirectionCheckResult]]]:
    """Filter spatial candidates by Stage E4 corridor direction.

    Returns:
        tuple of (eligible_candidates, excluded_candidates_with_results)
    """
    eligible: list[CandidateDriver] = []
    excluded: list[tuple[CandidateDriver, DirectionCheckResult]] = []

    pickup_pt = Point(request.pickupLng, request.pickupLat)
    dest_pt = Point(request.destLng, request.destLat)

    for candidate in candidates:
        result = evaluate_direction(
            route_geometry=candidate.route_geometry,
            pickup_lat=request.pickupLat,
            pickup_lng=request.pickupLng,
            dest_lat=request.destLat,
            dest_lng=request.destLng,
            subscription_type=request.subscriptionType,
            pickup_pt=pickup_pt,
            dest_pt=dest_pt,
        )

        if result.is_eligible:
            eligible.append(candidate)
        else:
            excluded.append((candidate, result))
            logger.debug(
                "matching.excluded.direction",
                driver_id=str(candidate.driver_profile_id),
                pos_pickup=round(result.pos_pickup, 6),
                pos_dest=round(result.pos_dest, 6),
                subscription_type=request.subscriptionType,
                exclusion_reason="DIRECTION",
            )

    return eligible, excluded

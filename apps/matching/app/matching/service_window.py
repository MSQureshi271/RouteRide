"""Canonical Service Window Construction & Invariant Validation (AD-10, AD-13, AD-14).

Single source of truth for constructing and validating requested commute service windows
shared across Stage E6 (Capacity Check) and Stage E7 (Timing Conflict Check).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import time

from fastapi import HTTPException, status

from app.config import settings
from app.maps.duration import calculate_haversine_duration_minutes
from app.schemas.internal_search import InternalSearchRequest

DEFAULT_BUFFER_MINUTES: int = 15
DEFAULT_MIN_LEG_GAP_MINUTES: int = 0
MINUTES_PER_DAY: int = 1440

__all__ = [
    "DEFAULT_BUFFER_MINUTES",
    "DEFAULT_MIN_LEG_GAP_MINUTES",
    "MINUTES_PER_DAY",
    "InvalidRoundTripTimesError",
    "InvalidServiceIntervalError",
    "RequestedServiceWindow",
    "build_requested_service_windows",
    "calculate_haversine_duration_minutes",
    "minutes_to_time",
    "time_str_to_minutes",
]


class InvalidServiceIntervalError(HTTPException):
    """Exception raised when a requested service interval crosses midnight or exceeds day bounds."""

    def __init__(
        self,
        message: str = "Cross-midnight service intervals are unsupported in Phase 1A",
    ) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_SERVICE_INTERVAL",
                "message": message,
            },
        )


class InvalidRoundTripTimesError(HTTPException):
    """Exception raised when a ROUND_TRIP pickup leg starts before departure leg finishes."""

    def __init__(
        self,
        message: str = "Afternoon leg must start after departure leg completion",
    ) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_ROUND_TRIP_TIMES",
                "message": message,
            },
        )


@dataclass(frozen=True, slots=True)
class RequestedServiceWindow:
    """Canonical service window(s) for a search request (AD-10, AD-13, AD-14).

    Pre-validated shared artifact passed to E6 Capacity and E7 Timing Conflict checks.
    Contains both datetime.time objects and minute-of-day integer representations
    to enable precise, wrap-around-free interval arithmetic.
    """

    has_departure_leg: bool
    departure_start: time | None
    departure_end: time | None
    has_pickup_leg: bool
    pickup_start: time | None
    pickup_end: time | None
    duration_minutes: float
    departure_start_min: int | None = None
    departure_end_min: int | None = None
    pickup_start_min: int | None = None
    pickup_end_min: int | None = None

    def get_departure_start_min(self) -> int | None:
        """Return departure start in minutes since midnight."""
        if self.departure_start_min is not None:
            return self.departure_start_min
        if self.departure_start is not None:
            return self.departure_start.hour * 60 + self.departure_start.minute
        return None

    def get_departure_end_min(self) -> int | None:
        """Return departure end in minutes since midnight."""
        if self.departure_end_min is not None:
            return self.departure_end_min
        if self.departure_end is not None:
            return self.departure_end.hour * 60 + self.departure_end.minute
        return None

    def get_pickup_start_min(self) -> int | None:
        """Return pickup start in minutes since midnight."""
        if self.pickup_start_min is not None:
            return self.pickup_start_min
        if self.pickup_start is not None:
            return self.pickup_start.hour * 60 + self.pickup_start.minute
        return None

    def get_pickup_end_min(self) -> int | None:
        """Return pickup end in minutes since midnight."""
        if self.pickup_end_min is not None:
            return self.pickup_end_min
        if self.pickup_end is not None:
            return self.pickup_end.hour * 60 + self.pickup_end.minute
        return None


def time_str_to_minutes(time_str: str) -> int:
    """Parse 'HH:MM' string to minutes since midnight."""
    hours_str, minutes_str = time_str.split(":")
    return int(hours_str) * 60 + int(minutes_str)


def minutes_to_time(minutes: int) -> time:
    """Convert minutes since midnight to datetime.time."""
    return time(hour=minutes // 60, minute=minutes % 60)


def build_requested_service_windows(
    request: InternalSearchRequest,
    buffer_minutes: int | None = None,
    city_speed_kmh: float | None = None,
    min_leg_gap_minutes: int | None = None,
    slot_gap_minutes: int | None = None,
) -> RequestedServiceWindow:
    """Construct and validate requested service windows with cross-midnight and leg gap checks.

    Window definition:
      - Departure: [departureTime - buffer, departureTime + buffer + duration]
      - Pickup:    [pickupTime - buffer, pickupTime + buffer + duration]

    Validation rules:
      - Any interval crossing midnight (start < 0 or end >= 1440 or start >= end) raises
        HTTP 400 INVALID_SERVICE_INTERVAL.
      - If conflict gap buffer extends beyond day boundaries (end + gap > 1440 or start - gap < 0),
        raises HTTP 400 INVALID_SERVICE_INTERVAL.
      - In ROUND_TRIP, pickupTime must follow departureTime, and
        departure_end + min_leg_gap_minutes <= pickup_start. Otherwise raises
        HTTP 400 INVALID_ROUND_TRIP_TIMES.
    """
    buf = buffer_minutes if buffer_minutes is not None else settings.MATCHING_TIME_BUFFER_MINUTES
    speed = city_speed_kmh if city_speed_kmh is not None else settings.MATCHING_CITY_SPEED_KMH
    leg_gap = (
        min_leg_gap_minutes
        if min_leg_gap_minutes is not None
        else settings.ROUND_TRIP_MIN_LEG_GAP_MINUTES
    )
    conflict_gap = (
        slot_gap_minutes if slot_gap_minutes is not None else settings.MATCHING_SLOT_GAP_MINUTES
    )

    duration = calculate_haversine_duration_minutes(
        request.pickupLat,
        request.pickupLng,
        request.destLat,
        request.destLng,
        city_speed_kmh=speed,
    )
    duration_rounded_minutes = math.ceil(duration)

    has_departure = request.subscriptionType in ("ONE_WAY", "ROUND_TRIP")
    has_pickup = request.subscriptionType == "ROUND_TRIP"

    departure_start: time | None = None
    departure_end: time | None = None
    m_start_min: int | None = None
    m_end_min: int | None = None

    pickup_start: time | None = None
    pickup_end: time | None = None
    a_start_min: int | None = None
    a_end_min: int | None = None

    if has_departure:
        m_center_min = time_str_to_minutes(request.departureTime)
        m_start_min = m_center_min - buf
        m_end_min = m_center_min + buf + duration_rounded_minutes

        if (
            m_start_min < 0
            or m_end_min >= MINUTES_PER_DAY
            or m_start_min >= m_end_min
            or (m_start_min - conflict_gap < 0)
            or (m_end_min + conflict_gap > MINUTES_PER_DAY)
        ):
            raise InvalidServiceIntervalError(
                f"Departure service window [{m_start_min}, {m_end_min}] crosses midnight or is invalid"
            )
        departure_start = minutes_to_time(m_start_min)
        departure_end = minutes_to_time(m_end_min)

    if has_pickup:
        a_time_str = (
            request.pickupTime if request.subscriptionType == "ROUND_TRIP" else request.departureTime
        )
        assert a_time_str is not None, "pickupTime required for pickup leg"
        a_center_min = time_str_to_minutes(a_time_str)
        a_start_min = a_center_min - buf
        a_end_min = a_center_min + buf + duration_rounded_minutes

        if (
            a_start_min < 0
            or a_end_min >= MINUTES_PER_DAY
            or a_start_min >= a_end_min
            or (a_start_min - conflict_gap < 0)
            or (a_end_min + conflict_gap > MINUTES_PER_DAY)
        ):
            raise InvalidServiceIntervalError(
                f"Pickup service window [{a_start_min}, {a_end_min}] crosses midnight or is invalid"
            )
        pickup_start = minutes_to_time(a_start_min)
        pickup_end = minutes_to_time(a_end_min)

    # ROUND_TRIP temporal relationship validation
    if request.subscriptionType == "ROUND_TRIP":
        assert m_center_min is not None and a_center_min is not None
        assert m_end_min is not None and a_start_min is not None

        if a_center_min <= m_center_min:
            raise InvalidRoundTripTimesError(
                f"Pickup time ({request.pickupTime}) must be after departure time ({request.departureTime})"
            )

        if m_end_min + leg_gap > a_start_min:
            raise InvalidRoundTripTimesError(
                f"Pickup service starts at {pickup_start} before departure service finishes at {departure_end} (min gap: {leg_gap}m)"
            )

    return RequestedServiceWindow(
        has_departure_leg=has_departure,
        departure_start=departure_start,
        departure_end=departure_end,
        departure_start_min=m_start_min,
        departure_end_min=m_end_min,
        has_pickup_leg=has_pickup,
        pickup_start=pickup_start,
        pickup_end=pickup_end,
        pickup_start_min=a_start_min,
        pickup_end_min=a_end_min,
        duration_minutes=duration,
    )

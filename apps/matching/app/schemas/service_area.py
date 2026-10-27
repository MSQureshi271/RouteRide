"""Amendment boundary validation matching shared TypeScript v2 fixtures.

Polygon validation here is structural. PostGIS enforces topology and platform
coverage before persistence; the road evaluator consumes validated snapshots.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

TimeValue = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
Day = Annotated[int, Field(ge=0, le=6)]
Leg = Literal["DEPARTURE", "PICKUP"]
Longitude = Annotated[float, Field(ge=-180, le=180)]
Latitude = Annotated[float, Field(ge=-90, le=90)]
Coordinates = tuple[Longitude, Latitude]


class BoundaryModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Point(BoundaryModel):
    type: Literal["Point"]
    coordinates: Coordinates


class LineString(BoundaryModel):
    type: Literal["LineString"]
    coordinates: list[Coordinates] = Field(min_length=2)


class Polygon(BoundaryModel):
    type: Literal["Polygon"]
    coordinates: list[list[Coordinates]] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_rings(self) -> Polygon:
        for ring in self.coordinates:
            if len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError("Polygon rings must be closed with at least four positions")
            area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:], strict=False))
            if area == 0:
                raise ValueError("Polygon rings must have nonzero area")
        return self


class LegAvailability(BoundaryModel):
    day: Day
    startTime: TimeValue
    endTime: TimeValue

    @model_validator(mode="after")
    def validate_window(self) -> LegAvailability:
        if self.startTime >= self.endTime:
            raise ValueError("Availability must end after it starts within one day")
        return self


class DriverServiceAreaSettings(BoundaryModel):
    serviceArea: Polygon
    startingLocation: Point
    availability: list[LegAvailability] = Field(min_length=1, max_length=28)
    acceptingRequests: bool
    routeState: Literal["UNSET", "ESTABLISHED"]
    routePolyline: LineString | None

    @model_validator(mode="after")
    def validate_settings(self) -> DriverServiceAreaSettings:
        if (self.routeState == "UNSET") != (self.routePolyline is None):
            raise ValueError("Route state must agree with geometry")
        for index, window in enumerate(self.availability):
            for other in self.availability[index + 1:]:
                if (window.day == other.day and window.startTime < other.endTime
                        and other.startTime < window.endTime):
                    raise ValueError("Availability windows on the same day must not overlap")
        return self


class RequestedLeg(BoundaryModel):
    legType: Leg
    pickupLocation: Point
    dropoffLocation: Point
    pickupWindowStart: TimeValue
    pickupWindowEnd: TimeValue
    arrivalDeadline: TimeValue

    @model_validator(mode="after")
    def validate_window(self) -> RequestedLeg:
        if not self.pickupWindowStart <= self.pickupWindowEnd < self.arrivalDeadline:
            raise ValueError("Pickup window and deadline must be ordered within one day")
        return self


class RequestSubscriptionV2(BoundaryModel):
    riderId: UUID
    driverProfileId: UUID
    type: Literal["ONE_WAY", "ROUND_TRIP"]
    operatingDays: list[Day] = Field(min_length=1, max_length=7)
    legs: list[RequestedLeg] = Field(min_length=1, max_length=2)
    startDate: date

    @model_validator(mode="after")
    def validate_legs(self) -> RequestSubscriptionV2:
        if len(set(self.operatingDays)) != len(self.operatingDays):
            raise ValueError("Operating days must be distinct")
        legs = {leg.legType: leg for leg in self.legs}
        if self.type == "ROUND_TRIP":
            if (set(legs) != {"DEPARTURE", "PICKUP"}
                    or legs["DEPARTURE"].arrivalDeadline >= legs["PICKUP"].pickupWindowStart):
                raise ValueError("Round trip requires both legs in chronological order")
        elif len(self.legs) != 1 or self.legs[0].legType != "DEPARTURE":
            raise ValueError("Requested legs must match subscription type")
        return self


class ProposalAssignment(BoundaryModel):
    day: Day
    legType: Leg
    runId: UUID | None
    orderedStopIds: list[UUID] = Field(min_length=2)

    @model_validator(mode="after")
    def distinct_stops(self) -> ProposalAssignment:
        if len(set(self.orderedStopIds)) != len(self.orderedStopIds):
            raise ValueError("Stop IDs must be distinct")
        return self


class FeasibilityProposalV2(BoundaryModel):
    version: Literal["v2"]
    requestId: UUID
    driverProfileId: UUID
    rosterVersion: int = Field(ge=0)
    availabilityVersion: int = Field(ge=0)
    policyVersion: str = Field(min_length=1)
    estimateVersion: str = Field(min_length=1)
    estimatedAt: datetime
    expiresAt: datetime
    status: Literal["FEASIBLE", "INFEASIBLE", "UNKNOWN"]
    reason: Literal["CAPACITY", "TIMING", "COVERAGE", "AVAILABILITY", "STALE_ESTIMATE", "MISSING_ESTIMATE", "NO_VALID_INSERTION"] | None
    assignments: list[ProposalAssignment]

    @model_validator(mode="after")
    def validate_evidence(self) -> FeasibilityProposalV2:
        if (self.estimatedAt.utcoffset() is None or self.expiresAt.utcoffset() is None
                or self.expiresAt <= self.estimatedAt):
            raise ValueError("Evidence requires an ordered timezone-aware lifetime")
        if self.status == "FEASIBLE":
            if self.reason is not None or not self.assignments:
                raise ValueError("Feasible proposals need assignments and no failure reason")
        elif self.reason is None or self.assignments:
            raise ValueError("Unverified proposals cannot carry accepted assignments")
        return self

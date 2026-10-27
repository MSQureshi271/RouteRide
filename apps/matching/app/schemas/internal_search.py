"""Internal search API contracts (AD-5, AD-11, T1.01).

Mirrors the TypeScript contracts defined in packages/contracts/src/modules/search.ts.
Used for internal communication: POST /internal/v1/matching/search.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ExclusionCode(StrEnum):
    """Canonical exclusion codes corresponding to E1–E7 (AD-11)."""

    DRIVER_STATUS = "DRIVER_STATUS"
    INVALID_GEOMETRY = "INVALID_GEOMETRY"
    DISTANCE = "DISTANCE"
    DIRECTION = "DIRECTION"
    OPERATING_DAY = "OPERATING_DAY"
    CAPACITY = "CAPACITY"
    TIMING = "TIMING"


class FirstFailureCounts(BaseModel):
    """Counts of candidates whose FIRST failing eligibility stage occurred at E1–E7."""

    model_config = ConfigDict(extra="forbid")

    driverStatus: int = Field(default=0, ge=0)
    invalidGeometry: int = Field(default=0, ge=0)
    distance: int = Field(default=0, ge=0)
    direction: int = Field(default=0, ge=0)
    operatingDay: int = Field(default=0, ge=0)
    capacity: int = Field(default=0, ge=0)
    timing: int = Field(default=0, ge=0)


class ExclusionSummary(BaseModel):
    """Summary of exclusion stage metrics for an internal search query."""

    model_config = ConfigDict(extra="forbid")

    firstFailureCounts: FirstFailureCounts = Field(default_factory=FirstFailureCounts)


class ScoreBreakdown(BaseModel):
    """Component score breakdown in [0, 1] per T1.06 canonical formulas."""

    model_config = ConfigDict(extra="forbid")

    proximityScore: float = Field(ge=0.0, le=1.0)
    timingScore: float = Field(ge=0.0, le=1.0)
    ratingScore: float = Field(ge=0.0, le=1.0)
    capacityScore: float = Field(ge=0.0, le=1.0)
    acceptanceScore: float = Field(ge=0.0, le=1.0)


class InternalSearchRequest(BaseModel):
    """Request payload for internal matching search (POST /internal/v1/matching/search)."""

    model_config = ConfigDict(extra="forbid")

    riderId: UUID
    pickupLat: float = Field(ge=-90.0, le=90.0)
    pickupLng: float = Field(ge=-180.0, le=180.0)
    destLat: float = Field(ge=-90.0, le=90.0)
    destLng: float = Field(ge=-180.0, le=180.0)
    day: int = Field(ge=0, le=6)
    departureTime: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    subscriptionType: Literal["ONE_WAY", "ROUND_TRIP"]
    pickupTime: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    pickupRadiusMeters: float = Field(default=1500.0, gt=0.0, le=10000.0)
    destRadiusMeters: float = Field(default=2000.0, gt=0.0, le=10000.0)

    @model_validator(mode="after")
    def validate_round_trip_pickup_time(self) -> InternalSearchRequest:
        """Require a later return pickup time for round trips."""
        if self.subscriptionType == "ROUND_TRIP" and (
            not self.pickupTime or self.pickupTime <= self.departureTime
        ):
            raise ValueError("pickupTime must be later than departureTime for ROUND_TRIP")
        if self.subscriptionType == "ONE_WAY" and "pickupTime" in self.model_fields_set:
            raise ValueError("pickupTime is only supported for ROUND_TRIP")
        return self


class InternalCandidateMatch(BaseModel):
    """Individual eligible driver match with composite score and display enrichment."""

    model_config = ConfigDict(extra="forbid")

    driverProfileId: UUID
    compositeScore: float = Field(ge=0.0, le=1.0)
    scoreBreakdown: ScoreBreakdown
    pickupDistanceMeters: float = Field(ge=0.0)
    destDistanceMeters: float = Field(ge=0.0)
    estimatedTripDurationMinutes: float = Field(ge=0.0)
    availableSeats: int = Field(ge=0)
    avgRating: float | None = Field(default=None, ge=1.0, le=5.0)
    reviewCount: int = Field(default=0, ge=0)


class InternalSearchResponse(BaseModel):
    """Response payload returned by the Python matching service to NestJS gateway."""

    model_config = ConfigDict(extra="forbid")

    results: list[InternalCandidateMatch]
    totalCandidatesEvaluated: int = Field(ge=0)
    totalEligible: int = Field(ge=0)
    exclusionSummary: ExclusionSummary
    meta: dict[str, Any]

"""Versioned service-area discovery contracts; v1 remains independently supported."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.internal_search import ScoreBreakdown


class DiscoveryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    riderId: UUID
    pickupLat: float = Field(ge=-90, le=90)
    pickupLng: float = Field(ge=-180, le=180)
    destLat: float = Field(ge=-90, le=90)
    destLng: float = Field(ge=-180, le=180)
    day: int = Field(ge=0, le=6)
    departureTime: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    subscriptionType: Literal["ONE_WAY", "ROUND_TRIP"]
    pickupTime: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def validate_legs(self) -> DiscoveryRequest:
        if self.subscriptionType == "ROUND_TRIP":
            if self.pickupTime is None or self.pickupTime <= self.departureTime:
                raise ValueError("ROUND_TRIP requires pickupTime after departureTime")
        elif "pickupTime" in self.model_fields_set:
            raise ValueError("pickupTime is only supported for ROUND_TRIP")
        return self


class DiscoveryCandidate(BaseModel):
    """Database snapshot used only inside matching, before score serialization."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    driverProfileId: UUID
    routeState: Literal["UNSET", "ESTABLISHED"]
    pickupDistanceMeters: float | None = Field(ge=0)
    destDistanceMeters: float | None = Field(ge=0)
    availableSeats: int = Field(ge=1)
    seatCapacity: int = Field(default=3, ge=1, exclude=True)
    availabilityStatus: Literal["AVAILABLE"] = "AVAILABLE"
    reviewStatus: Literal["REQUIRED", "NOT_REQUIRED"] = "REQUIRED"
    avgRating: float | None = Field(default=None, ge=1, le=5)
    reviewCount: int = Field(default=0, ge=0)
    acceptedCount: int = Field(default=0, ge=0, exclude=True)
    terminalCount: int = Field(default=0, ge=0, exclude=True)
    timingScore: float = Field(default=0.5, ge=0, le=1, exclude=True)


class DiscoveryMatch(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    driverProfileId: UUID
    routeState: Literal["UNSET", "ESTABLISHED"]
    pickupDistanceMeters: float | None = Field(ge=0)
    destDistanceMeters: float | None = Field(ge=0)
    availableSeats: int = Field(ge=1)
    availabilityStatus: Literal["AVAILABLE"]
    reviewStatus: Literal["REQUIRED", "NOT_REQUIRED"]
    avgRating: float | None = Field(ge=1, le=5)
    reviewCount: int = Field(ge=0)
    compositeScore: float = Field(ge=0, le=1)
    scoreBreakdown: ScoreBreakdown

    @model_validator(mode="after")
    def validate_distances(self) -> DiscoveryMatch:
        distances = (self.pickupDistanceMeters, self.destDistanceMeters)
        if self.routeState == "UNSET" and any(value is not None for value in distances):
            raise ValueError("UNSET route distances must be null")
        if self.routeState == "ESTABLISHED" and any(value is None for value in distances):
            raise ValueError("ESTABLISHED route distances must be supplied")
        return self


class DiscoveryPagination(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: int = Field(ge=1)
    pageSize: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    hasMore: bool


class DiscoveryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal["v2"] = "v2"
    results: list[DiscoveryMatch]
    pagination: DiscoveryPagination
    policyVersion: str

"""Google Routes v2 road matrix adapter, invoked only for explicit previews.

Reference: https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix
No retries or straight-line fallback. The client lifetime belongs to the caller.
"""

from __future__ import annotations

import hashlib
import math
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

import httpx
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from app.maps.road_times import RoadTimeMatrix, RoutingPolicy

if TYPE_CHECKING:
    from app.config import Settings


class ElementStatus(BaseModel):
    code: int = 0


class MatrixElement(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # Protobuf JSON omits scalar default values, including zero indices.
    originIndex: int = Field(default=0, ge=0)
    destinationIndex: int = Field(default=0, ge=0)
    status: ElementStatus = Field(default_factory=ElementStatus)
    condition: str
    duration: str = Field(pattern=r"^\d+(\.\d{1,9})?s$")


class GoogleRoadTimeProvider:
    def __init__(
        self, client: httpx.AsyncClient, api_key: str,
        points: Mapping[str, tuple[float, float]], policy: RoutingPolicy,
        *, departure_at: datetime | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("Google Routes key is required")
        if any(not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180)
               for lat, lng in points.values()):
            raise ValueError("Invalid road matrix coordinates")
        if departure_at is not None and departure_at.utcoffset() is None:
            raise ValueError("Road departure must be timezone aware")
        self.client = client
        self.api_key = api_key
        self.points = dict(points)
        self.policy = policy
        self.departure_at = departure_at

    async def fetch(self, point_keys: tuple[str, ...]) -> RoadTimeMatrix:
        if (not point_keys or len(point_keys) > 25 or len(set(point_keys)) != len(point_keys)
                or any(key not in self.points for key in point_keys)):
            raise ValueError("Road matrix requires 1-25 distinct known points")
        waypoints = [{"waypoint": {"location": {"latLng": {
            "latitude": self.points[key][0], "longitude": self.points[key][1],
        }}}} for key in point_keys]
        body: dict[str, object] = {
            "origins": waypoints, "destinations": waypoints,
            "travelMode": "DRIVE", "routingPreference": "TRAFFIC_AWARE",
        }
        if self.departure_at is not None:
            body["departureTime"] = self.departure_at.astimezone(UTC).isoformat().replace("+00:00", "Z")
        response = await self.client.post(
            "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
            headers={"X-Goog-Api-Key": self.api_key,
                     "X-Goog-FieldMask": "originIndex,destinationIndex,status,condition,duration"},
            json=body, timeout=self.policy.timeout_seconds,
        )
        response.raise_for_status()
        elements = TypeAdapter(list[MatrixElement]).validate_python(response.json())
        durations: dict[tuple[str, str], float] = {}
        for element in elements:
            if (element.status.code != 0 or element.condition != "ROUTE_EXISTS"
                    or element.originIndex >= len(point_keys) or element.destinationIndex >= len(point_keys)):
                raise ValueError("Unavailable road matrix element")
            pair = (point_keys[element.originIndex], point_keys[element.destinationIndex])
            if pair in durations:
                raise ValueError("Duplicate road matrix element")
            durations[pair] = float(element.duration[:-1])
        if len(durations) != len(point_keys) ** 2:
            raise ValueError("Incomplete road matrix")
        return RoadTimeMatrix(f"google-routes-v2:{uuid4()}", datetime.now(UTC), durations)


def configured_road_provider(
    client: httpx.AsyncClient, points: Mapping[str, tuple[float, float]], config: Settings,
    *, departure_at: datetime | None = None,
) -> GoogleRoadTimeProvider | None:
    """Explicit opt-in factory, isolated from application startup/search execution."""
    if not config.MATCHING_ROAD_TIMES_ENABLED:
        return None
    values = (config.MATCHING_ROAD_MAX_AGE_SECONDS, config.MATCHING_ROAD_TRAVEL_MULTIPLIER,
              config.MATCHING_ROAD_STOP_SERVICE_SECONDS, config.MATCHING_ROAD_TIMEOUT_SECONDS)
    # Changing any operational value changes the proposal policy revision.
    revision = hashlib.sha256(repr(values).encode()).hexdigest()[:16]
    policy = RoutingPolicy(f"road-policy-v1:{revision}", *values)
    return GoogleRoadTimeProvider(client, config.GOOGLE_MAPS_API_KEY or "", points, policy,
                                  departure_at=departure_at)

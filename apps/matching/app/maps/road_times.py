"""Authoritative road-time evidence boundary, isolated from search and DB locks.

The display-only Haversine/cache estimator cannot implement this boundary: it
lacks provider provenance, freshness and an actual road-time matrix. Operational
policy must be supplied explicitly by the caller before acceptance is enabled.
"""

from __future__ import annotations

import asyncio
import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from types import MappingProxyType
from typing import Protocol


@dataclass(frozen=True)
class RoutingPolicy:
    version: str
    max_estimate_age_seconds: float
    travel_multiplier: float
    stop_service_seconds: float
    timeout_seconds: float

    def __post_init__(self) -> None:
        values = (self.max_estimate_age_seconds, self.travel_multiplier,
                  self.stop_service_seconds, self.timeout_seconds)
        if (not self.version or not all(math.isfinite(value) for value in values)
                or self.max_estimate_age_seconds <= 0 or self.travel_multiplier < 1
                or self.stop_service_seconds < 0 or self.timeout_seconds <= 0):
            raise ValueError("Invalid operational routing policy")


@dataclass(frozen=True)
class RoadTimeMatrix:
    version: str
    estimated_at: datetime
    durations_seconds: Mapping[tuple[str, str], float]

    def __post_init__(self) -> None:
        if not self.version or self.estimated_at.utcoffset() is None:
            raise ValueError("Road evidence requires version and timezone-aware timestamp")
        if any(not math.isfinite(value) or value < 0 for value in self.durations_seconds.values()):
            raise ValueError("Road durations must be finite nonnegative seconds")
        object.__setattr__(self, "durations_seconds", MappingProxyType(dict(self.durations_seconds)))

    def seconds(self, origin: str, destination: str) -> float | None:
        return 0.0 if origin == destination else self.durations_seconds.get((origin, destination))


class RoadTimeProvider(Protocol):
    async def fetch(self, point_keys: tuple[str, ...]) -> RoadTimeMatrix: ...


async def load_road_times(
    provider: RoadTimeProvider, point_keys: tuple[str, ...], policy: RoutingPolicy,
) -> RoadTimeMatrix | None:
    """Bound the external call; unavailable evidence cannot fall back to Haversine."""
    try:
        return await asyncio.wait_for(provider.fetch(point_keys), timeout=policy.timeout_seconds)
    except Exception:
        # Do not log provider exception text: it may contain precise coordinates.
        return None

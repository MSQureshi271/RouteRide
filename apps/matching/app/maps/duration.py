"""Trip duration calculation and estimation module (Phase 1A Task 1.05).

Implements canonical commute duration logic per AD-13 and AD-14:
1. Hard eligibility (E6 Capacity and E7 Timing Conflict checks) STRICTLY and ALWAYS
   uses the deterministic Haversine duration formula:
       haversine_km = haversine_distance_meters(...) / 1000.0
       duration_minutes = (haversine_km * detour_factor / city_speed_kmh) * 60.0
   This guarantees that driver eligibility is 100% reproducible and invariant of
   network, Maps API, or Redis cache state.
2. Display-only duration estimation:
   Optional external distance matrix providers and caching are isolated to response
   enrichment (T1.08) via DisplayDurationEstimator. They never alter hard eligibility.
"""

from __future__ import annotations

import json
import math
from typing import Any, Protocol

DEFAULT_CITY_SPEED_KMH: float = 25.0
DEFAULT_DETOUR_FACTOR: float = 1.3
EARTH_RADIUS_METERS: float = 6371000.0


def haversine_distance_meters(
    lat1: float,
    lng1: float,
    lat2: float,
    lng2: float,
) -> float:
    """Calculate great-circle distance between two WGS 84 points in meters."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c


def calculate_haversine_duration_minutes(
    pickup_lat: float,
    pickup_lng: float,
    dest_lat: float,
    dest_lng: float,
    city_speed_kmh: float = DEFAULT_CITY_SPEED_KMH,
    detour_factor: float = DEFAULT_DETOUR_FACTOR,
) -> float:
    """Calculate deterministic commute duration in minutes via canonical Haversine formula (AD-13, AD-14).

    Formula:
      haversine_km = haversine_distance_meters(...) / 1000.0
      duration_minutes = (haversine_km * detour_factor / city_speed_kmh) * 60.0

    Exclusively used by hard eligibility (E6 capacity window building and E7 timing conflict checks).
    """
    meters = haversine_distance_meters(pickup_lat, pickup_lng, dest_lat, dest_lng)
    km = meters / 1000.0
    return (km * detour_factor / city_speed_kmh) * 60.0


class DisplayDurationEstimator(Protocol):
    """Protocol for display-only duration estimation (used for search response enrichment in T1.08).

    Never used for hard eligibility checks.
    """

    async def estimate_duration_minutes(
        self,
        pickup_lat: float,
        pickup_lng: float,
        dest_lat: float,
        dest_lng: float,
    ) -> float:
        """Estimate commute duration for display purposes."""
        ...


class DeterministicHaversineEstimator:
    """Default duration estimator implementing DisplayDurationEstimator via Haversine."""

    def __init__(
        self,
        city_speed_kmh: float = DEFAULT_CITY_SPEED_KMH,
        detour_factor: float = DEFAULT_DETOUR_FACTOR,
    ) -> None:
        self.city_speed_kmh = city_speed_kmh
        self.detour_factor = detour_factor

    async def estimate_duration_minutes(
        self,
        pickup_lat: float,
        pickup_lng: float,
        dest_lat: float,
        dest_lng: float,
    ) -> float:
        return calculate_haversine_duration_minutes(
            pickup_lat,
            pickup_lng,
            dest_lat,
            dest_lng,
            city_speed_kmh=self.city_speed_kmh,
            detour_factor=self.detour_factor,
        )


class RedisCachedDurationEstimator:
    """Duration estimator that queries Redis cache for precomputed durations (Task 1.10c).

    Falls back to DeterministicHaversineEstimator on cache miss or Redis error.
    """

    def __init__(
        self,
        redis_client: Any,
        fallback_estimator: DisplayDurationEstimator | None = None,
    ) -> None:
        self.redis_client = redis_client
        self.fallback = fallback_estimator or DeterministicHaversineEstimator()

    async def estimate_duration_minutes(
        self,
        pickup_lat: float,
        pickup_lng: float,
        dest_lat: float,
        dest_lng: float,
    ) -> float:
        cache_key = f"duration:{pickup_lat:.4f},{pickup_lng:.4f}:{dest_lat:.4f},{dest_lng:.4f}"
        if self.redis_client:
            try:
                cached_val = await self.redis_client.get(cache_key)
                if cached_val:
                    if isinstance(cached_val, bytes):
                        cached_val = cached_val.decode("utf-8")
                    try:
                        data = json.loads(cached_val)
                        if isinstance(data, dict) and "durationMinutes" in data:
                            return float(data["durationMinutes"])
                        elif isinstance(data, (int, float)):
                            return float(data)
                    except (ValueError, TypeError):
                        pass
            except Exception:
                pass

        return await self.fallback.estimate_duration_minutes(
            pickup_lat, pickup_lng, dest_lat, dest_lng
        )

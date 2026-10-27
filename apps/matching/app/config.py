"""Configuration management and fail-fast startup validation for RouteRide Matching Service.

Implements AD-6:
- Canonical alias: ROUTE_SERVICE_BBOX ("minLon,minLat,maxLon,maxLat")
- Compatibility variables: LAUNCH_CITY_BBOX_MIN_LAT, LAUNCH_CITY_BBOX_MAX_LAT,
                           LAUNCH_CITY_BBOX_MIN_LON, LAUNCH_CITY_BBOX_MAX_LON
- Default fallback: Karachi bounds (minLat=24.7000, maxLat=25.1500, minLon=66.8500, maxLon=67.3500)
- Fail-fast validation inequalities:
    - -90 <= minLat <= 90 and -90 <= maxLat <= 90
    - -180 <= minLon <= 180 and -180 <= maxLon <= 180
    - minLat < maxLat and minLon < maxLon (non-zero area)
- Strict equality assertion (within 0.0001 deg) when both alias and individual vars are set.
- Immediate process termination (sys.exit(1)) on invalid configuration.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass

import structlog
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = structlog.get_logger(service="routeride-matching")

DEFAULT_KARACHI_MIN_LON = 66.8500
DEFAULT_KARACHI_MIN_LAT = 24.7000
DEFAULT_KARACHI_MAX_LON = 67.3500
DEFAULT_KARACHI_MAX_LAT = 25.1500
BBOX_TOLERANCE = 0.0001


@dataclass(frozen=True)
class ServiceBoundingBox:
    """Canonical representation of the service bounding box."""

    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Service Bounding Box
    ROUTE_SERVICE_BBOX: str | None = None
    LAUNCH_CITY_BBOX_MIN_LAT: float | None = None
    LAUNCH_CITY_BBOX_MAX_LAT: float | None = None
    LAUNCH_CITY_BBOX_MIN_LON: float | None = None
    LAUNCH_CITY_BBOX_MAX_LON: float | None = None

    # Database
    DATABASE_URL: str = "postgresql://routeride:changeme@localhost:5432/routeride_dev"
    DATABASE_RO_URL: str | None = None
    DB_POOL_MIN_SIZE: int = 2
    DB_POOL_MAX_SIZE: int = 10
    DB_TIMEOUT_SECONDS: float = 3.0

    # Matching parameters
    MATCHING_PICKUP_RADIUS_M: float = 1500.0
    MATCHING_DEST_RADIUS_M: float = 2000.0
    MATCHING_SLOT_GAP_MINUTES: int = 0
    MATCHING_TIME_BUFFER_MINUTES: int = 15
    MATCHING_CITY_SPEED_KMH: float = 25.0
    ROUND_TRIP_MIN_LEG_GAP_MINUTES: int = 0
    MAX_TIMING_DIFF_MINUTES: float = 60.0
    MATCHING_MAX_RESULTS: int = 20
    MATCHING_CONFIG_VERSION: str = "2"
    # Road evidence is opt-in; search never uses this provider or policy.
    GOOGLE_MAPS_API_KEY: str | None = None
    MATCHING_ROAD_TIMES_ENABLED: bool = False
    MATCHING_ROAD_MAX_AGE_SECONDS: float = 300
    MATCHING_ROAD_TRAVEL_MULTIPLIER: float = 1.2
    MATCHING_ROAD_STOP_SERVICE_SECONDS: float = 60
    MATCHING_ROAD_TIMEOUT_SECONDS: float = 5

    @model_validator(mode="after")
    def validate_road_policy(self) -> Settings:
        from app.maps.road_times import RoutingPolicy

        RoutingPolicy("road-policy-v1", self.MATCHING_ROAD_MAX_AGE_SECONDS,
                      self.MATCHING_ROAD_TRAVEL_MULTIPLIER,
                      self.MATCHING_ROAD_STOP_SERVICE_SECONDS, self.MATCHING_ROAD_TIMEOUT_SECONDS)
        if self.MATCHING_ROAD_TIMES_ENABLED and not self.GOOGLE_MAPS_API_KEY:
            raise ValueError("Enabled road-time provider requires GOOGLE_MAPS_API_KEY")
        return self

    # Scoring weights (PRD §7.4, sum to 1.0)
    MATCHING_WEIGHT_PROXIMITY: float = 0.40
    MATCHING_WEIGHT_TIMING: float = 0.25
    MATCHING_WEIGHT_RATING: float = 0.20
    MATCHING_WEIGHT_CAPACITY: float = 0.10
    MATCHING_WEIGHT_ACCEPTANCE: float = 0.05

    # Bayesian shrinkage priors and weights (AD-8)
    MATCHING_RATING_PRIOR: float = 0.7
    MATCHING_RATING_WEIGHT: float = 5.0
    MATCHING_RATING_PRIOR_WEIGHT: float | None = None
    MATCHING_ACCEPTANCE_PRIOR: float = 0.8
    MATCHING_ACCEPTANCE_WEIGHT: float = 5.0
    MATCHING_ACCEPTANCE_PRIOR_WEIGHT: float | None = None

    # Observability
    LOG_LEVEL: str = "INFO"
    OTEL_EXPORTER_OTLP_ENDPOINT: str | None = None
    SENTRY_DSN: str | None = None
    NODE_ENV: str = "development"

    @property
    def effective_database_url(self) -> str:
        """Return the read-only database URL if set, otherwise fallback to DATABASE_URL."""
        return self.DATABASE_RO_URL or self.DATABASE_URL

    @model_validator(mode="after")
    def resolve_weight_aliases(self) -> Settings:
        """Resolve optional prior weight aliases to primary weight settings."""
        if self.MATCHING_RATING_PRIOR_WEIGHT is not None:
            object.__setattr__(self, "MATCHING_RATING_WEIGHT", self.MATCHING_RATING_PRIOR_WEIGHT)
        if self.MATCHING_ACCEPTANCE_PRIOR_WEIGHT is not None:
            object.__setattr__(
                self, "MATCHING_ACCEPTANCE_WEIGHT", self.MATCHING_ACCEPTANCE_PRIOR_WEIGHT
            )
        return self


def parse_bbox_alias(raw_bbox: str) -> ServiceBoundingBox:
    """Parse 'minLon,minLat,maxLon,maxLat' string into ServiceBoundingBox."""
    parts = [p.strip() for p in raw_bbox.split(",")]
    if len(parts) != 4:
        raise ValueError(
            f"ROUTE_SERVICE_BBOX must contain exactly 4 comma-separated values (minLon,minLat,maxLon,maxLat), got: '{raw_bbox}'"
        )
    try:
        min_lon = float(parts[0])
        min_lat = float(parts[1])
        max_lon = float(parts[2])
        max_lat = float(parts[3])
    except ValueError as exc:
        raise ValueError(
            f"ROUTE_SERVICE_BBOX coordinates must be valid floating point numbers: {exc}"
        ) from exc

    return ServiceBoundingBox(
        min_lon=min_lon,
        min_lat=min_lat,
        max_lon=max_lon,
        max_lat=max_lat,
    )


def validate_bounding_box(bbox: ServiceBoundingBox) -> None:
    """Validate coordinate bounds and non-zero area inequalities."""
    if not (-90.0 <= bbox.min_lat <= 90.0):
        raise ValueError(f"min_lat must be between -90 and 90, got: {bbox.min_lat}")
    if not (-90.0 <= bbox.max_lat <= 90.0):
        raise ValueError(f"max_lat must be between -90 and 90, got: {bbox.max_lat}")
    if not (-180.0 <= bbox.min_lon <= 180.0):
        raise ValueError(f"min_lon must be between -180 and 180, got: {bbox.min_lon}")
    if not (-180.0 <= bbox.max_lon <= 180.0):
        raise ValueError(f"max_lon must be between -180 and 180, got: {bbox.max_lon}")

    if bbox.min_lat >= bbox.max_lat:
        raise ValueError(
            f"min_lat must be strictly less than max_lat (non-zero area), got: min_lat={bbox.min_lat}, max_lat={bbox.max_lat}"
        )
    if bbox.min_lon >= bbox.max_lon:
        raise ValueError(
            f"min_lon must be strictly less than max_lon (non-zero area), got: min_lon={bbox.min_lon}, max_lon={bbox.max_lon}"
        )


def resolve_service_bbox(settings: Settings) -> ServiceBoundingBox:
    """Resolve and validate the canonical bounding box with precedence and equality assertion.

    Precedence:
    1. Canonical alias ROUTE_SERVICE_BBOX
    2. Individual LAUNCH_CITY_BBOX_*
    3. Default Karachi bounding box

    Fail-fast contract (AD-6):
    - Asserts exact coordinate inequalities and non-zero area.
    - If both alias and individual variables are provided, they must match within 0.0001 deg.
    - Aborts startup with sys.exit(1) on failure.
    """
    alias_bbox: ServiceBoundingBox | None = None
    ind_bbox: ServiceBoundingBox | None = None

    try:
        if settings.ROUTE_SERVICE_BBOX:
            alias_bbox = parse_bbox_alias(settings.ROUTE_SERVICE_BBOX)
            validate_bounding_box(alias_bbox)

        has_any_ind = any(
            v is not None
            for v in (
                settings.LAUNCH_CITY_BBOX_MIN_LAT,
                settings.LAUNCH_CITY_BBOX_MAX_LAT,
                settings.LAUNCH_CITY_BBOX_MIN_LON,
                settings.LAUNCH_CITY_BBOX_MAX_LON,
            )
        )

        if has_any_ind:
            if any(
                v is None
                for v in (
                    settings.LAUNCH_CITY_BBOX_MIN_LAT,
                    settings.LAUNCH_CITY_BBOX_MAX_LAT,
                    settings.LAUNCH_CITY_BBOX_MIN_LON,
                    settings.LAUNCH_CITY_BBOX_MAX_LON,
                )
            ):
                raise ValueError(
                    "All four LAUNCH_CITY_BBOX_* variables (MIN_LAT, MAX_LAT, MIN_LON, MAX_LON) must be set together."
                )

            assert settings.LAUNCH_CITY_BBOX_MIN_LON is not None
            assert settings.LAUNCH_CITY_BBOX_MIN_LAT is not None
            assert settings.LAUNCH_CITY_BBOX_MAX_LON is not None
            assert settings.LAUNCH_CITY_BBOX_MAX_LAT is not None

            ind_bbox = ServiceBoundingBox(
                min_lon=settings.LAUNCH_CITY_BBOX_MIN_LON,
                min_lat=settings.LAUNCH_CITY_BBOX_MIN_LAT,
                max_lon=settings.LAUNCH_CITY_BBOX_MAX_LON,
                max_lat=settings.LAUNCH_CITY_BBOX_MAX_LAT,
            )
            validate_bounding_box(ind_bbox)

        # Equality check when both are provided
        if alias_bbox is not None and ind_bbox is not None:
            diffs = {
                "min_lon": abs(alias_bbox.min_lon - ind_bbox.min_lon),
                "min_lat": abs(alias_bbox.min_lat - ind_bbox.min_lat),
                "max_lon": abs(alias_bbox.max_lon - ind_bbox.max_lon),
                "max_lat": abs(alias_bbox.max_lat - ind_bbox.max_lat),
            }
            mismatches = [k for k, diff in diffs.items() if diff > BBOX_TOLERANCE]
            if mismatches:
                raise ValueError(
                    f"Startup fail-fast: ROUTE_SERVICE_BBOX and LAUNCH_CITY_BBOX_* describe different bounding boxes (> {BBOX_TOLERANCE}° difference on {mismatches}). "
                    f"Alias: {alias_bbox}, Individual: {ind_bbox}"
                )

        if alias_bbox is not None:
            resolved = alias_bbox
        elif ind_bbox is not None:
            resolved = ind_bbox
        else:
            resolved = ServiceBoundingBox(
                min_lon=DEFAULT_KARACHI_MIN_LON,
                min_lat=DEFAULT_KARACHI_MIN_LAT,
                max_lon=DEFAULT_KARACHI_MAX_LON,
                max_lat=DEFAULT_KARACHI_MAX_LAT,
            )
            validate_bounding_box(resolved)

        return resolved

    except Exception as exc:
        logger.error(
            "bbox_startup_validation_failed",
            error=str(exc),
            ROUTE_SERVICE_BBOX=settings.ROUTE_SERVICE_BBOX,
        )
        sys.exit(1)


# Singleton instances
settings = Settings()
service_bbox = resolve_service_bbox(settings)

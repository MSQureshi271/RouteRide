"""Unit tests for config.py and startup fail-fast bounding box validation (AD-6)."""

import pytest

from app.config import (
    DEFAULT_KARACHI_MAX_LAT,
    DEFAULT_KARACHI_MAX_LON,
    DEFAULT_KARACHI_MIN_LAT,
    DEFAULT_KARACHI_MIN_LON,
    Settings,
    resolve_service_bbox,
)


def test_default_karachi_fallback() -> None:
    """When no bbox config is provided, resolve_service_bbox falls back to Karachi defaults."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX=None,
        LAUNCH_CITY_BBOX_MIN_LAT=None,
        LAUNCH_CITY_BBOX_MAX_LAT=None,
        LAUNCH_CITY_BBOX_MIN_LON=None,
        LAUNCH_CITY_BBOX_MAX_LON=None,
    )
    bbox = resolve_service_bbox(cfg)
    assert bbox.min_lon == DEFAULT_KARACHI_MIN_LON
    assert bbox.min_lat == DEFAULT_KARACHI_MIN_LAT
    assert bbox.max_lon == DEFAULT_KARACHI_MAX_LON
    assert bbox.max_lat == DEFAULT_KARACHI_MAX_LAT


def test_alias_only_valid() -> None:
    """When only ROUTE_SERVICE_BBOX is provided, it is parsed and validated."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX="66.8500,24.7000,67.3500,25.1500",
        LAUNCH_CITY_BBOX_MIN_LAT=None,
        LAUNCH_CITY_BBOX_MAX_LAT=None,
        LAUNCH_CITY_BBOX_MIN_LON=None,
        LAUNCH_CITY_BBOX_MAX_LON=None,
    )
    bbox = resolve_service_bbox(cfg)
    assert bbox.min_lon == 66.85
    assert bbox.min_lat == 24.70
    assert bbox.max_lon == 67.35
    assert bbox.max_lat == 25.15


def test_individual_vars_only_valid() -> None:
    """When only LAUNCH_CITY_BBOX_* variables are provided, they are validated and used."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX=None,
        LAUNCH_CITY_BBOX_MIN_LAT=24.70,
        LAUNCH_CITY_BBOX_MAX_LAT=25.15,
        LAUNCH_CITY_BBOX_MIN_LON=66.85,
        LAUNCH_CITY_BBOX_MAX_LON=67.35,
    )
    bbox = resolve_service_bbox(cfg)
    assert bbox.min_lon == 66.85
    assert bbox.min_lat == 24.70
    assert bbox.max_lon == 67.35
    assert bbox.max_lat == 25.15


def test_alias_and_individual_match_within_tolerance() -> None:
    """When both alias and individual vars are set and match within 0.0001, validation succeeds."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX="66.85005,24.70005,67.35005,25.15005",
        LAUNCH_CITY_BBOX_MIN_LAT=24.7000,
        LAUNCH_CITY_BBOX_MAX_LAT=25.1500,
        LAUNCH_CITY_BBOX_MIN_LON=66.8500,
        LAUNCH_CITY_BBOX_MAX_LON=67.3500,
    )
    bbox = resolve_service_bbox(cfg)
    assert abs(bbox.min_lon - 66.85005) < 1e-6


def test_mismatched_alias_and_individual_exits_fast() -> None:
    """When alias and individual vars describe different boxes (> 0.0001 deg), process exits."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX="66.8500,24.7000,67.3500,25.1500",
        LAUNCH_CITY_BBOX_MIN_LAT=24.8000,  # 0.1 deg discrepancy
        LAUNCH_CITY_BBOX_MAX_LAT=25.1500,
        LAUNCH_CITY_BBOX_MIN_LON=66.8500,
        LAUNCH_CITY_BBOX_MAX_LON=67.3500,
    )
    with pytest.raises(SystemExit) as exc_info:
        resolve_service_bbox(cfg)
    assert exc_info.value.code == 1


def test_partial_individual_vars_exits_fast() -> None:
    """Setting only some LAUNCH_CITY_BBOX_* variables causes fail-fast exit."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX=None,
        LAUNCH_CITY_BBOX_MIN_LAT=24.70,
        LAUNCH_CITY_BBOX_MAX_LAT=None,  # missing
        LAUNCH_CITY_BBOX_MIN_LON=66.85,
        LAUNCH_CITY_BBOX_MAX_LON=67.35,
    )
    with pytest.raises(SystemExit) as exc_info:
        resolve_service_bbox(cfg)
    assert exc_info.value.code == 1


def test_malformed_alias_non_numeric_exits_fast() -> None:
    """Non-numeric alias causes fail-fast exit."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX="invalid,24.70,67.35,25.15",
    )
    with pytest.raises(SystemExit) as exc_info:
        resolve_service_bbox(cfg)
    assert exc_info.value.code == 1


def test_malformed_alias_wrong_part_count_exits_fast() -> None:
    """Alias with != 4 parts causes fail-fast exit."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX="66.85,24.70,67.35",
    )
    with pytest.raises(SystemExit) as exc_info:
        resolve_service_bbox(cfg)
    assert exc_info.value.code == 1


def test_inverted_latitude_exits_fast() -> None:
    """min_lat >= max_lat causes fail-fast exit."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX="66.85,25.15,67.35,24.70",  # inverted lat
    )
    with pytest.raises(SystemExit) as exc_info:
        resolve_service_bbox(cfg)
    assert exc_info.value.code == 1


def test_inverted_longitude_exits_fast() -> None:
    """min_lon >= max_lon causes fail-fast exit."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX="67.35,24.70,66.85,25.15",  # inverted lon
    )
    with pytest.raises(SystemExit) as exc_info:
        resolve_service_bbox(cfg)
    assert exc_info.value.code == 1


def test_out_of_bounds_coordinates_exits_fast() -> None:
    """Coordinates outside WGS84 range cause fail-fast exit."""
    cfg = Settings(
        ROUTE_SERVICE_BBOX="66.85,-95.0,67.35,25.15",  # lat < -90
    )
    with pytest.raises(SystemExit) as exc_info:
        resolve_service_bbox(cfg)
    assert exc_info.value.code == 1


def test_effective_database_url() -> None:
    """effective_database_url prioritizes DATABASE_RO_URL over DATABASE_URL."""
    cfg = Settings(
        DATABASE_URL="postgresql://default:pass@localhost:5432/db",
        DATABASE_RO_URL="postgresql://ro:pass@localhost:5432/db",
    )
    assert cfg.effective_database_url == "postgresql://ro:pass@localhost:5432/db"

    cfg_fallback = Settings(
        DATABASE_URL="postgresql://default:pass@localhost:5432/db",
        DATABASE_RO_URL=None,
    )
    assert cfg_fallback.effective_database_url == "postgresql://default:pass@localhost:5432/db"

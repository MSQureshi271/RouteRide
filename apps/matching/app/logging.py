"""Structured logging with structlog for the RouteRide Matching Service.

Rules:
 - JSON output
 - Bound fields: service, timestamp, level
 - Coordinate rounding (2 decimal places for lat/lng)
 - Redaction for sensitive keys
"""
import os
import structlog
from typing import Any, MutableMapping

COORD_KEYS = {"lat", "lng", "latitude", "longitude"}
SENSITIVE_KEYS = {"password", "token", "secret", "authorization", "cookie", "otp", "key"}


def round_coordinates_processor(
    _logger: Any, _name: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    """Recursively round lat/lng values to 2 decimal places."""
    for key, val in list(event_dict.items()):
        if key in COORD_KEYS and isinstance(val, (int, float)):
            event_dict[key] = round(val, 2)
        elif isinstance(val, dict):
            event_dict[key] = round_coordinates_processor(_logger, _name, val)
    return event_dict


def redact_sensitive_processor(
    _logger: Any, _name: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    """Redact sensitive fields from logs."""
    for key in list(event_dict.keys()):
        if any(sens in key.lower() for sens in SENSITIVE_KEYS):
            event_dict[key] = "[REDACTED]"
    return event_dict


def configure_logging(service_name: str = "routeride-matching") -> None:
    """Configure structlog for production JSON logging."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            redact_sensitive_processor,
            round_coordinates_processor,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(structlog.stdlib, log_level, structlog.stdlib.INFO)
            if hasattr(structlog, "stdlib")
            else 20
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


logger = structlog.get_logger(service="routeride-matching")

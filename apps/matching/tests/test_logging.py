"""Unit tests for structlog structured logging, coordinate rounding, and PII redaction."""
import pytest
import structlog
from app.logging import (
    configure_logging,
    round_coordinates_processor,
    redact_sensitive_processor,
)


def test_round_coordinates_processor_top_level() -> None:
    """Coordinate keys at top-level should be rounded to 2 decimal places."""
    event = {
        "event": "driver_ping",
        "lat": 24.8607343,
        "lng": 67.0011364,
        "latitude": 24.912345,
        "longitude": 67.123456,
        "speed": 45.6789,
        "heading": 180,
    }
    result = round_coordinates_processor(None, "test", event)
    assert result["lat"] == 24.86
    assert result["lng"] == 67.00
    assert result["latitude"] == 24.91
    assert result["longitude"] == 67.12
    assert result["speed"] == 45.6789
    assert result["heading"] == 180


def test_round_coordinates_processor_nested() -> None:
    """Nested dictionaries containing coordinate keys should be recursively rounded."""
    event = {
        "event": "route_match",
        "origin": {
            "lat": 24.861234,
            "lng": 67.009876,
            "address": "Clifton Block 2",
        },
        "destination": {
            "lat": 24.918765,
            "lng": 67.114321,
            "city": "Karachi",
        },
    }
    result = round_coordinates_processor(None, "test", event)
    assert result["origin"]["lat"] == 24.86
    assert result["origin"]["lng"] == 67.01
    assert result["destination"]["lat"] == 24.92
    assert result["destination"]["lng"] == 67.11


def test_redact_sensitive_processor() -> None:
    """Sensitive keys matching SENSITIVE_KEYS should be redacted."""
    event = {
        "event": "user_auth",
        "email": "user@example.com",
        "password": "supersecretpassword",
        "jwt_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "api_secret": "sec_123456",
        "AUTHORIZATION_HEADER": "Bearer token123",
        "session_cookie": "sess_abc",
        "sms_otp": "123456",
        "stripe_key": "mock_secret_key",
        "username": "karachi_driver",
    }
    result = redact_sensitive_processor(None, "test", event)
    assert result["password"] == "[REDACTED]"
    assert result["jwt_token"] == "[REDACTED]"
    assert result["api_secret"] == "[REDACTED]"
    assert result["AUTHORIZATION_HEADER"] == "[REDACTED]"
    assert result["session_cookie"] == "[REDACTED]"
    assert result["sms_otp"] == "[REDACTED]"
    assert result["stripe_key"] == "[REDACTED]"
    assert result["email"] == "user@example.com"
    assert result["username"] == "karachi_driver"


def test_configure_logging_custom_level(monkeypatch: pytest.MonkeyPatch) -> None:
    """configure_logging should succeed with custom log level from environment."""
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
    configure_logging(service_name="test-matching")
    logger = structlog.get_logger(service="test-matching")
    assert logger is not None


def test_configure_logging_default_level(monkeypatch: pytest.MonkeyPatch) -> None:
    """configure_logging should succeed when LOG_LEVEL is unset."""
    monkeypatch.delenv("LOG_LEVEL", raising=False)
    configure_logging()
    logger = structlog.get_logger()
    assert logger is not None

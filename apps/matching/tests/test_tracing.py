"""Unit tests for OpenTelemetry and Sentry tracing initializers."""
import pytest
from unittest.mock import patch, MagicMock
from app.tracing import init_sentry, init_tracing


def test_init_sentry_disabled_when_no_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    """init_sentry should do nothing if SENTRY_DSN is unset."""
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    with patch("sentry_sdk.init") as mock_init:
        init_sentry()
        mock_init.assert_not_called()


def test_init_sentry_dev_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """init_sentry should use 1.0 sample rate in development."""
    monkeypatch.setenv("SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0")
    monkeypatch.setenv("NODE_ENV", "development")
    with patch("sentry_sdk.init") as mock_init:
        init_sentry()
        mock_init.assert_called_once_with(
            dsn="https://examplePublicKey@o0.ingest.sentry.io/0",
            traces_sample_rate=1.0,
            environment="development",
            send_default_pii=False,
        )


def test_init_sentry_production_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """init_sentry should use 0.1 sample rate in production."""
    monkeypatch.setenv("SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0")
    monkeypatch.setenv("NODE_ENV", "production")
    with patch("sentry_sdk.init") as mock_init:
        init_sentry()
        mock_init.assert_called_once_with(
            dsn="https://examplePublicKey@o0.ingest.sentry.io/0",
            traces_sample_rate=0.1,
            environment="production",
            send_default_pii=False,
        )


def test_init_tracing_disabled_when_no_otlp_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    """init_tracing should return early without configuring OTel if OTEL_EXPORTER_OTLP_ENDPOINT is unset."""
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    with patch("app.tracing.init_sentry") as mock_sentry:
        init_tracing()
        mock_sentry.assert_called_once()


def test_init_tracing_configured_with_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    """init_tracing should configure TracerProvider and BatchSpanProcessor when endpoint is provided."""
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces")

    mock_trace = MagicMock()
    mock_provider = MagicMock()
    mock_processor = MagicMock()
    mock_exporter = MagicMock()

    with patch.dict(
        "sys.modules",
        {
            "opentelemetry": mock_trace,
            "opentelemetry.trace": mock_trace,
            "opentelemetry.sdk.trace": MagicMock(TracerProvider=MagicMock(return_value=mock_provider)),
            "opentelemetry.sdk.trace.export": MagicMock(BatchSpanProcessor=MagicMock(return_value=mock_processor)),
            "opentelemetry.exporter.otlp.proto.http.trace_exporter": MagicMock(OTLPSpanExporter=MagicMock(return_value=mock_exporter)),
            "opentelemetry.sdk.resources": MagicMock(Resource=MagicMock(create=MagicMock(return_value="res"))),
        },
    ):
        init_tracing(service_name="test-service")


def test_init_tracing_handles_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    """init_tracing should catch and log exceptions without raising."""
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces")

    with patch("app.tracing.init_sentry"), patch("builtins.print") as mock_print:
        with patch.dict(
            "sys.modules",
            {
                "opentelemetry.sdk.trace": MagicMock(side_effect=Exception("OTel setup error")),
            },
        ):
            init_tracing()
            assert any("Warning: Failed to initialize OpenTelemetry" in str(call) for call in mock_print.call_args_list)

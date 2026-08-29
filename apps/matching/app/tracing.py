"""OpenTelemetry and Sentry setup for the RouteRide Matching Service."""
import os
import sentry_sdk
from typing import Optional


def init_sentry() -> None:
    """Initialize Sentry for Python matching service."""
    sentry_dsn = os.getenv("SENTRY_DSN")
    if sentry_dsn:
        sentry_sdk.init(
            dsn=sentry_dsn,
            traces_sample_rate=1.0 if os.getenv("NODE_ENV") != "production" else 0.1,
            environment=os.getenv("NODE_ENV", "development"),
            send_default_pii=False,
        )


def init_tracing(service_name: str = "routeride-matching") -> None:
    """Initialize OpenTelemetry tracing if configured."""
    init_sentry()
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not otlp_endpoint:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource

        resource = Resource.create({"service.name": service_name})
        provider = TracerProvider(resource=resource)
        processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint))
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)
    except Exception as exc:
        print(f"Warning: Failed to initialize OpenTelemetry: {exc}")

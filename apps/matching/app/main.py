"""RouteRide Matching Service — FastAPI application root.

Features:
- Async lifespan with database connection pool management (asyncpg).
- Structured logging with correlation ID (X-Request-Id) propagation.
- OpenTelemetry tracing instrumentation.
- Startup fail-fast configuration validation (AD-6).
- Liveness and readiness health checks.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import asyncpg
import structlog
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.config import resolve_service_bbox, settings
from app.logging import configure_logging, logger
from app.matching.discovery import execute_discovery
from app.matching.engine import execute_search
from app.schemas.discovery import DiscoveryRequest, DiscoveryResponse
from app.schemas.internal_search import InternalSearchRequest, InternalSearchResponse
from app.tracing import init_tracing

# Configure structured logging and tracing
configure_logging(service_name="routeride-matching")
init_tracing(service_name="routeride-matching")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle manager."""
    # 1. Startup: Validate bounding box fail-fast
    resolve_service_bbox(settings)
    logger.info(
        "matching_service_starting",
        environment=settings.NODE_ENV,
        db_url_configured=bool(settings.effective_database_url),
    )

    # 2. Database connection pool initialization
    app.state.db_pool = None
    if settings.effective_database_url:
        try:
            app.state.db_pool = await asyncpg.create_pool(
                dsn=settings.effective_database_url,
                min_size=settings.DB_POOL_MIN_SIZE,
                max_size=settings.DB_POOL_MAX_SIZE,
                command_timeout=settings.DB_TIMEOUT_SECONDS,
            )
            logger.info("db_pool_initialized")
        except Exception as exc:
            logger.warning("db_pool_initialization_deferred", error=str(exc))

    yield

    # 3. Shutdown: Close database pool
    if getattr(app.state, "db_pool", None) is not None:
        logger.info("closing_db_pool")
        await app.state.db_pool.close()
    logger.info("matching_service_stopped")


app = FastAPI(
    title="RouteRide Matching Service",
    description="Route-matching microservice for the RouteRide platform",
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def request_id_and_logging_middleware(request: Request, call_next: Any) -> Response:
    """Extract or generate X-Request-Id and bind to structlog contextvars."""
    req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=req_id)

    response: Response = await call_next(request)
    response.headers["x-request-id"] = req_id
    return response


@app.get("/health")
async def health(request: Request) -> Response:
    """Liveness & readiness probe endpoint."""
    pool: asyncpg.Pool | None = getattr(request.app.state, "db_pool", None)
    if pool is None:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "ok", "database": "not_configured"},
        )

    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "ok", "database": "connected"},
        )
    except Exception as exc:
        logger.error("health_check_db_failed", error=str(exc))
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "error", "database": "unreachable"},
        )


@app.post(
    "/internal/v1/matching/search",
    response_model=InternalSearchResponse,
    status_code=status.HTTP_200_OK,
)
async def internal_search(
    request: Request,
    search_payload: InternalSearchRequest,
) -> Any:
    """Internal route-matching search endpoint (AD-5, AD-11, T1.08, T1.09)."""
    pool: asyncpg.Pool | None = getattr(request.app.state, "db_pool", None)
    if pool is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": "DATABASE_UNAVAILABLE",
                "message": "Matching database pool is not initialized",
            },
        )

    return await execute_search(pool, search_payload)


@app.post("/internal/v2/matching/search", response_model=DiscoveryResponse)
async def internal_discovery(request: Request, search_payload: DiscoveryRequest) -> Any:
    """Service-area discovery; no external routing or write-side allocation."""
    pool: asyncpg.Pool | None = getattr(request.app.state, "db_pool", None)
    if pool is None:
        return JSONResponse(status_code=503, content={"error": "DATABASE_UNAVAILABLE"})
    return await execute_discovery(pool, search_payload)


# Instrument FastAPI with OpenTelemetry
try:
    FastAPIInstrumentor.instrument_app(app)
except Exception as exc:
    logger.warning("otel_instrumentation_failed", error=str(exc))

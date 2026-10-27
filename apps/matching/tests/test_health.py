"""Unit tests for health check endpoint, request ID middleware, and lifespan manager."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.main import app, lifespan


@pytest.mark.asyncio
async def test_health_no_db_pool(async_client: AsyncClient) -> None:
    """When db_pool is None, health endpoint returns 200 with not_configured."""
    app.state.db_pool = None
    resp = await async_client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "database": "not_configured"}
    assert "x-request-id" in resp.headers


@pytest.mark.asyncio
async def test_health_db_pool_healthy(async_client: AsyncClient, mock_db_pool: MagicMock) -> None:
    """When db_pool is healthy, health endpoint returns 200 with connected."""
    app.state.db_pool = mock_db_pool
    resp = await async_client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "database": "connected"}


@pytest.mark.asyncio
async def test_health_db_pool_error(async_client: AsyncClient) -> None:
    """When db_pool connection fails, health endpoint returns 503 with unreachable."""
    failing_pool = MagicMock()
    ctx = AsyncMock()
    ctx.__aenter__.side_effect = Exception("DB connection timeout")
    failing_pool.acquire.return_value = ctx

    app.state.db_pool = failing_pool
    resp = await async_client.get("/health")
    assert resp.status_code == 503
    assert resp.json() == {"status": "error", "database": "unreachable"}


@pytest.mark.asyncio
async def test_request_id_middleware_propagation(async_client: AsyncClient) -> None:
    """Incoming x-request-id header should be preserved and returned."""
    custom_id = "test-request-id-12345"
    resp = await async_client.get("/health", headers={"x-request-id": custom_id})
    assert resp.status_code == 200
    assert resp.headers["x-request-id"] == custom_id


@pytest.mark.asyncio
async def test_lifespan_successful_pool_init_and_close() -> None:
    """Lifespan creates pool on startup and closes it on shutdown."""
    mock_pool = MagicMock()
    mock_pool.close = AsyncMock()

    with patch("asyncpg.create_pool", new=AsyncMock(return_value=mock_pool)):
        async with lifespan(app):
            assert app.state.db_pool == mock_pool
        mock_pool.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_lifespan_pool_init_failure_handled_gracefully() -> None:
    """Lifespan handles create_pool failure without crashing."""
    with patch("asyncpg.create_pool", side_effect=Exception("Connection refused")):
        async with lifespan(app):
            assert app.state.db_pool is None

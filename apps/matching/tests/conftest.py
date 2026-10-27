"""Shared pytest fixtures for RouteRide Matching Service."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock

import asyncpg
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture(autouse=True)
def reset_app_state() -> Generator[None, None, None]:
    """Ensure app.state.db_pool is clean before and after every test."""
    app.state.db_pool = None
    yield
    app.state.db_pool = None


@pytest.fixture
def test_app() -> FastAPI:
    """Return the FastAPI application."""
    return app


@pytest.fixture
async def async_client(test_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client bound to the FastAPI application via ASGITransport."""
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        yield client


@pytest.fixture
def mock_db_pool() -> MagicMock:
    """Mock asyncpg Pool fixture."""
    pool = MagicMock(spec=asyncpg.Pool)
    conn = AsyncMock(spec=asyncpg.Connection)
    conn.fetchval = AsyncMock(return_value=1)

    # Context manager mock for pool.acquire()
    acquire_ctx = AsyncMock()
    acquire_ctx.__aenter__.return_value = conn
    acquire_ctx.__aexit__.return_value = None
    pool.acquire.return_value = acquire_ctx
    pool.close = AsyncMock()
    return pool

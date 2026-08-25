"""Scaffold test — verifies the health endpoint exists."""
from httpx import AsyncClient, ASGITransport
import pytest

from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint() -> None:
    """Health endpoint must return 200 with status: ok."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

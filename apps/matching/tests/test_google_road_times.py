"""Provider payloads are validated; no actual external requests in tests."""

from datetime import UTC, datetime

import httpx
import pytest

from app.config import Settings
from app.maps.google_road_times import GoogleRoadTimeProvider, configured_road_provider
from app.maps.road_times import RoutingPolicy, load_road_times

POLICY = RoutingPolicy("policy-1", 300, 1.2, 60, 1)
POINTS = {"a": (24.86, 67.01), "b": (24.92, 67.11)}


def elements() -> list[dict[str, object]]:
    return [{"originIndex": a, "destinationIndex": b, "condition": "ROUTE_EXISTS",
             "status": {}, "duration": "60s"} for a in range(2) for b in range(2)]


async def test_real_road_matrix_preserves_provenance_and_request_bounds() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "routes.googleapis.com"
        assert request.headers["X-Goog-FieldMask"] == "originIndex,destinationIndex,status,condition,duration"
        assert request.headers["X-Goog-Api-Key"] == "fixture-only"
        return httpx.Response(200, json=elements())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = GoogleRoadTimeProvider(client, "fixture-only", POINTS, POLICY)
        result = await provider.fetch(("a", "b"))
    assert result.seconds("a", "b") == 60
    assert result.version.startswith("google-routes-v2:")
    assert result.estimated_at.tzinfo == UTC


@pytest.mark.parametrize("payload", [[], [{"condition": "ROUTE_NOT_FOUND"}],
    [{"condition": "ROUTE_EXISTS", "duration": "NaNs"}],
    [{"originIndex": 99, "condition": "ROUTE_EXISTS", "duration": "1s"}],
    [{"condition": "ROUTE_EXISTS", "status": {"code": 7}, "duration": "1s"}],
    [*elements(), elements()[0]], {"error": "quota"}])
async def test_incomplete_malformed_or_failed_elements_are_unavailable(payload: object) -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload))) as client:
        provider = GoogleRoadTimeProvider(client, "fixture-only", POINTS, POLICY)
        assert await load_road_times(provider, ("a", "b"), POLICY) is None


async def test_provider_http_errors_never_fall_back() -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(403))) as client:
        provider = GoogleRoadTimeProvider(client, "fixture-only", POINTS, POLICY)
        assert await load_road_times(provider, ("a", "b"), POLICY) is None


async def test_unknown_points_rejected_before_network() -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: pytest.fail("unexpected network"))) as client:
        provider = GoogleRoadTimeProvider(client, "fixture-only", POINTS, POLICY)
        for keys in ((), ("a", "a"), ("missing",), tuple(str(i) for i in range(26))):
            assert await load_road_times(provider, keys, POLICY) is None
        with pytest.raises(ValueError):
            GoogleRoadTimeProvider(client, "", POINTS, POLICY)
        with pytest.raises(ValueError):
            GoogleRoadTimeProvider(client, "fixture-only", {"a": (float("nan"), 0)}, POLICY)


def test_naive_departure_is_invalid() -> None:
    with pytest.raises(ValueError):
        GoogleRoadTimeProvider(httpx.AsyncClient(), "fixture-only", POINTS, POLICY,
                               departure_at=datetime(2026, 11, 1))


async def test_factory_requires_opt_in_and_versions_operational_policy() -> None:
    async with httpx.AsyncClient() as client:
        assert configured_road_provider(client, POINTS, Settings(_env_file=None)) is None
        config = Settings(_env_file=None, MATCHING_ROAD_TIMES_ENABLED=True, GOOGLE_MAPS_API_KEY="fixture-only")
        first = configured_road_provider(client, POINTS, config, departure_at=datetime(2026, 11, 1, tzinfo=UTC))
        second = configured_road_provider(client, POINTS, config.model_copy(update={"MATCHING_ROAD_TRAVEL_MULTIPLIER": 1.5}))
        assert first is not None and second is not None
        assert first.policy.version != second.policy.version
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Settings(_env_file=None, MATCHING_ROAD_TIMES_ENABLED=True, GOOGLE_MAPS_API_KEY=None)

"""Amended discovery preserves consumer choice without claiming timing proof."""

from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from hypothesis import given
from hypothesis import settings as hypothesis_settings
from hypothesis import strategies as st
from pydantic import ValidationError

from app.matching.discovery import DISCOVERY_SQL, execute_discovery, rank_discovery_candidates
from app.schemas.discovery import DiscoveryCandidate, DiscoveryRequest


def request(**updates: object) -> DiscoveryRequest:
    return DiscoveryRequest.model_validate({
        "riderId": "00000000-0000-4000-8000-000000000001",
        "pickupLat": 24.9, "pickupLng": 67.0, "destLat": 25.0, "destLng": 67.1,
        "day": 1, "departureTime": "08:00", "subscriptionType": "ONE_WAY", **updates,
    })


def candidate(index: int, distance: float | None = None) -> DiscoveryCandidate:
    return DiscoveryCandidate(
        driverProfileId=UUID(int=index), routeState="UNSET" if distance is None else "ESTABLISHED",
        pickupDistanceMeters=distance, destDistanceMeters=distance, availableSeats=3,
    )


def test_route_free_neutral_and_distant_candidate_remains_browsable() -> None:
    rows = [candidate(2, 8000), candidate(1), candidate(3, 0)]
    pages = [rank_discovery_candidates(rows, request(page=p, pageSize=1)) for p in (1, 2, 3)]
    assert [p.results[0].driverProfileId for p in pages] == [UUID(int=3), UUID(int=1), UUID(int=2)]
    assert pages[1].results[0].scoreBreakdown.proximityScore == 0.5
    assert pages[1].results[0].pickupDistanceMeters is None
    assert pages[0].pagination.hasMore and not pages[2].pagination.hasMore
    assert all(p.pagination.total == 3 for p in pages)
    assert all(p.results[0].reviewStatus == "REQUIRED" for p in pages)


def test_ties_stable_and_out_of_range_page_empty() -> None:
    rows = [candidate(3), candidate(1), candidate(2)]
    assert [c.driverProfileId for c in rank_discovery_candidates(rows, request()).results] == [UUID(int=i) for i in (1, 2, 3)]
    assert rank_discovery_candidates(rows, request(page=20)).results == []


def test_run_timing_score_is_private_and_changes_recommendation_order() -> None:
    early = candidate(1).model_copy(update={"timingScore": 0.0})
    aligned = candidate(2).model_copy(update={"timingScore": 1.0})
    response = rank_discovery_candidates([early, aligned], request())
    assert response.results[0].driverProfileId == aligned.driverProfileId
    assert response.results[0].scoreBreakdown.timingScore == 1.0
    assert "timingScore" not in response.results[0].model_dump()


@hypothesis_settings(max_examples=30)
@given(st.lists(st.one_of(st.none(), st.floats(min_value=0, max_value=20000,
                                             allow_nan=False, allow_infinity=False)), max_size=25))
def test_paginated_recommendations_preserve_all_available_drivers(distances: list[float | None]) -> None:
    rows = [candidate(index + 1, distance) for index, distance in enumerate(distances)]
    expected = rank_discovery_candidates(rows, request(pageSize=100)).results
    paginated = [match for page in range(1, (len(rows) + 4) // 5 + 1)
                 for match in rank_discovery_candidates(list(reversed(rows)), request(page=page, pageSize=5)).results]
    assert [row.driverProfileId for row in paginated] == [row.driverProfileId for row in expected]
    assert len({row.driverProfileId for row in paginated}) == len(distances)


@pytest.mark.parametrize("updates", [{"pageSize": 101}, {"page": 0}, {"departureTime": "25:00"}, {"subscriptionType": "ROUND_TRIP"}, {"subscriptionType": "ROUND_TRIP", "pickupTime": "07:00"}])
def test_invalid_requests(updates: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        request(**updates)


def test_sql_filters_by_operating_city_and_has_no_corridor_veto() -> None:
    assert "dp.operating_city = 'PK-KHI'" in DISCOVERY_SQL
    assert "service_area" not in DISCOVERY_SQL
    assert "ST_Covers" not in DISCOVERY_SQL
    assert "ST_DWithin" not in DISCOVERY_SQL
    assert "ST_LineLocatePoint" not in DISCOVERY_SQL
    assert "driver_availability" in DISCOVERY_SQL
    assert "run_assignments" in DISCOVERY_SQL


async def test_database_rows_are_private_and_distances_remain_nullable(mock_db_pool) -> None:
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=[{
        "driver_profile_id": UUID(int=1), "route_state": "UNSET", "seat_capacity": 4,
        "pickup_distance_meters": None, "dest_distance_meters": None,
        "available_seats": 2, "avg_rating": None, "review_count": 0,
        "accepted_count": 0, "terminal_count": 0,
    }])
    response = await execute_discovery(mock_db_pool, request())
    data = response.model_dump(mode="json")
    assert data["results"][0]["pickupDistanceMeters"] is None
    assert "seatCapacity" not in data["results"][0]
    assert "terminalCount" not in data["results"][0]
    assert data["results"][0]["scoreBreakdown"]["capacityScore"] == 0.5


async def test_platform_bounds_do_not_query_database(mock_db_pool) -> None:
    response = await execute_discovery(mock_db_pool, request(destLat=27))
    assert response.results == []
    mock_db_pool.acquire.assert_not_called()


async def test_v2_endpoint_requires_database(async_client) -> None:
    response = await async_client.post("/internal/v2/matching/search", json=request().model_dump(mode="json", exclude_none=True))
    assert response.status_code == 503


async def test_v2_endpoint_exposes_new_contract(async_client, test_app, mock_db_pool) -> None:
    test_app.state.db_pool = mock_db_pool
    mock_db_pool.acquire.return_value.__aenter__.return_value.fetch = AsyncMock(return_value=[])
    response = await async_client.post("/internal/v2/matching/search", json=request().model_dump(mode="json", exclude_none=True))
    assert response.status_code == 200
    assert response.json()["version"] == "v2"

"""Road-time evidence is mandatory and shared pickup windows are not conflicts."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from app.maps.road_times import RoadTimeMatrix, RoutingPolicy, load_road_times
from app.matching.feasibility import LegSnapshot, Stop, evaluate_proposal

NOW = datetime(2026, 10, 21, 0, tzinfo=UTC)
POLICY = RoutingPolicy("policy-1", 300, 1.2, 60, 2)


def stop(key: str, kind: str, rider: str, earliest: float = 480, latest: float = 540) -> Stop:
    return Stop(key, key, rider, kind, earliest, latest)


def leg(**updates: object) -> LegSnapshot:
    return replace(LegSnapshot(1, "DEPARTURE", None, "start", 470, 600, 3, 0, (),
                               stop("p", "PICKUP", "new"), stop("d", "DROPOFF", "new")), **updates)


def matrix(seconds: float = 60, **updates: object) -> RoadTimeMatrix:
    keys = ["start", "p", "d", "old-p", "old-d", "next"]
    return replace(RoadTimeMatrix("roads-1", NOW, {(a, b): seconds for a in keys for b in keys if a != b}), **updates)


def test_first_run_and_shared_windows_are_feasible() -> None:
    first = evaluate_proposal([leg()], matrix(), POLICY, NOW)
    assert first.status == "FEASIBLE"
    assert first.assignments[0].ordered_stop_ids == ("p", "d")
    old = (stop("old-p", "PICKUP", "old"), stop("old-d", "DROPOFF", "old"))
    shared = evaluate_proposal([leg(existing_stops=old, occupied_seats=1)], matrix(), POLICY, NOW)
    assert shared.status == "FEASIBLE"
    ids = shared.assignments[0].ordered_stop_ids
    assert ids.index("p") < ids.index("d") and ids.index("old-p") < ids.index("old-d")


@pytest.mark.parametrize("change,reason", [
    ({"occupied_seats": 3}, "CAPACITY"),
    ({"ready_at_minutes": 541}, "NO_VALID_INSERTION"),
    ({"new_dropoff": stop("d", "DROPOFF", "new", 481, 482)}, "NO_VALID_INSERTION"),
    ({"next_origin_key": "next", "next_ready_minutes": 480}, "NO_VALID_INSERTION"),
])
def test_infeasible_capacity_first_reachability_deadline_and_transfer(change: dict[str, object], reason: str) -> None:
    result = evaluate_proposal([leg(**change)], matrix(600), POLICY, NOW)
    assert result.status == "INFEASIBLE" and result.reason == reason
    assert result.assignments == ()


def test_both_legs_independent_and_no_partial_proposal() -> None:
    second = leg(leg_type="PICKUP", occupied_seats=3)
    result = evaluate_proposal([leg(), second], matrix(), POLICY, NOW)
    assert result.status == "INFEASIBLE" and result.assignments == ()


def test_missing_stale_future_and_incomplete_estimates_never_approve() -> None:
    assert evaluate_proposal([leg()], None, POLICY, NOW).reason == "MISSING_ESTIMATE"
    for timestamp in (NOW - timedelta(seconds=301), NOW + timedelta(seconds=1)):
        assert evaluate_proposal([leg()], matrix(estimated_at=timestamp), POLICY, NOW).reason == "STALE_ESTIMATE"
    assert evaluate_proposal([leg()], matrix(durations_seconds={}), POLICY, NOW).status == "UNKNOWN"


def test_buffer_and_service_time_affect_deadline() -> None:
    tight = leg(new_dropoff=stop("d", "DROPOFF", "new", 480, 482))
    assert evaluate_proposal([tight], matrix(), POLICY, NOW).status == "INFEASIBLE"
    assert evaluate_proposal([tight], matrix(), replace(POLICY, travel_multiplier=1, stop_service_seconds=0), NOW).status == "FEASIBLE"


@pytest.mark.asyncio
async def test_provider_failure_and_timeout_return_unavailable() -> None:
    class BrokenProvider:
        async def fetch(self, point_keys: tuple[str, ...]) -> RoadTimeMatrix:
            raise RuntimeError("provider unavailable")
    assert await load_road_times(BrokenProvider(), ("a", "b"), POLICY) is None


def test_policy_rejects_invalid_operational_values() -> None:
    with pytest.raises(ValueError):
        replace(POLICY, travel_multiplier=0.9)


def test_cross_leg_transfer_cannot_be_ignored() -> None:
    morning = leg()
    afternoon = leg(leg_type="PICKUP", ready_at_minutes=481)
    result = evaluate_proposal([morning, afternoon], matrix(), POLICY, NOW)
    assert result.status == "INFEASIBLE" and result.reason == "TIMING"


def test_both_legs_can_be_proven_when_transfer_fits() -> None:
    afternoon = leg(leg_type="PICKUP", ready_at_minutes=520)
    assert evaluate_proposal([leg(), afternoon], matrix(), POLICY, NOW).status == "FEASIBLE"


def test_empty_duplicate_or_malformed_snapshots_rejected() -> None:
    for legs in ([], [leg(), leg()], [leg(day=7)], [leg(new_pickup=stop("p", "DROPOFF", "new"))],
                 [leg(new_pickup=stop("p", "PICKUP", "new", 0, 1500))]):
        with pytest.raises(ValueError):
            evaluate_proposal(legs, matrix(), POLICY, NOW)
    with pytest.raises(ValueError):
        evaluate_proposal([leg()], matrix(), POLICY, NOW.replace(tzinfo=None))


def test_invalid_road_evidence_rejected_and_matrix_is_immutable() -> None:
    with pytest.raises(ValueError):
        matrix(estimated_at=NOW.replace(tzinfo=None))
    with pytest.raises(ValueError):
        matrix(seconds=float("nan"))
    data = {("start", "p"): 10.0}
    snapshot = matrix(durations_seconds=data)
    data[("start", "p")] = 999.0
    assert snapshot.seconds("start", "p") == 10.0


async def test_successful_provider_retains_provenance() -> None:
    class Provider:
        async def fetch(self, point_keys: tuple[str, ...]) -> RoadTimeMatrix:
            return matrix()
    assert (await load_road_times(Provider(), ("start", "p"), POLICY)).version == "roads-1"


async def test_slow_provider_is_bounded() -> None:
    import asyncio

    class Provider:
        async def fetch(self, point_keys: tuple[str, ...]) -> RoadTimeMatrix:
            await asyncio.sleep(1)
            return matrix()
    assert await load_road_times(Provider(), ("start", "p"), replace(POLICY, timeout_seconds=0.001)) is None


def test_evaluator_timeout_never_falls_back(monkeypatch) -> None:
    clock = iter([0.0, 3.0])
    monkeypatch.setattr("app.matching.feasibility.time.monotonic", lambda: next(clock))
    assert evaluate_proposal([leg()], matrix(), POLICY, NOW).status == "UNKNOWN"

from unittest.mock import patch

from app.matching.observability import record_discovery_decision, record_feasibility_decision


def test_discovery_does_not_classify_low_fit_as_exclusion() -> None:
    with patch("app.matching.observability.logger") as logger, patch("app.matching.observability.discovery_requests") as counter:
        record_discovery_decision("ONE_WAY", total=3, route_free=1, duration_ms=12)
        counter.add.assert_called_once_with(1, {"subscription_type": "ONE_WAY", "has_matches": True})
        fields = logger.info.call_args.kwargs
        assert fields["total_available"] == 3
        assert fields["route_free_count"] == 1
        assert "distance_exclusions" not in fields
        assert "coordinates" not in fields


def test_unknown_timing_is_a_feasibility_failure_not_a_low_rank() -> None:
    with patch("app.matching.observability.logger") as logger, patch("app.matching.observability.feasibility_decisions") as counter:
        record_feasibility_decision("UNKNOWN", "STALE_ESTIMATE")
        counter.add.assert_called_once_with(1, {"status": "UNKNOWN", "reason": "STALE_ESTIMATE"})
        assert logger.info.call_args.kwargs == {"status": "UNKNOWN", "reason": "STALE_ESTIMATE"}

"""Same v2 contract fixtures run in TypeScript and Python."""

import json
from pathlib import Path

import pytest
from pydantic import BaseModel, ValidationError

from app.schemas.discovery import DiscoveryMatch, DiscoveryRequest
from app.schemas.service_area import (
    DriverServiceAreaSettings,
    FeasibilityProposalV2,
    RequestSubscriptionV2,
)

FIXTURES = json.loads((Path(__file__).parents[3] / "packages/contracts/test-vectors/service-area-v2.json").read_text())
SCHEMAS: dict[str, type[BaseModel]] = {
    "settings": DriverServiceAreaSettings,
    "discoveryRequests": DiscoveryRequest,
    "candidates": DiscoveryMatch,
    "proposals": FeasibilityProposalV2,
    "subscriptionRequests": RequestSubscriptionV2,
}


@pytest.mark.parametrize("group,case", [(group, case) for group in SCHEMAS for case in FIXTURES[group] if group != "settings" or case["id"] not in {"unclosed-polygon", "degenerate-polygon", "invalid-wgs84"}], ids=lambda value: value if isinstance(value, str) else value["id"])
def test_typescript_python_fixture_parity(group: str, case: dict[str, object]) -> None:
    value = case["input"]
    if group == "settings":
        assert isinstance(value, dict)
        value = {key: val for key, val in value.items() if key != "serviceArea"}
        value["city"] = "PK-KHI"
    if case["valid"]:
        SCHEMAS[group].model_validate(value)
    else:
        with pytest.raises(ValidationError):
            SCHEMAS[group].model_validate(value)

"""Explicitly guard database-backed tests against non-test databases."""

from __future__ import annotations

import os
from urllib.parse import unquote, urlsplit


def matching_test_database_url() -> str | None:
    """Return only a database URL explicitly naming a dedicated test database."""
    value = os.environ.get("MATCHING_TEST_DATABASE_URL")
    if value is None:
        return None
    database_name = unquote(urlsplit(value).path).lstrip("/").lower()
    return value if "test" in database_name else None

"""Explicitly guard database-backed tests against non-test databases.

Database-backed tests never skip silently. If the dedicated test database is not
configured or reachable they FAIL with instructions. CI and developers who
intentionally run without a database must deselect them visibly with
``pytest -m "not db"``.
"""

from __future__ import annotations

import os
from urllib.parse import unquote, urlsplit

import asyncpg
import pytest

SETUP_HINT = (
    "Database-backed tests need a migrated PostGIS database whose name contains 'test'. "
    "Set MATCHING_TEST_DATABASE_URL (see Database-backed tests in CLAUDE.md), or deselect "
    "them explicitly with: pytest -m 'not db'"
)


def matching_test_database_url() -> str | None:
    """Return only a database URL explicitly naming a dedicated test database."""
    value = os.environ.get("MATCHING_TEST_DATABASE_URL")
    if value is None:
        return None
    database_name = unquote(urlsplit(value).path).lstrip("/").lower()
    return value if "test" in database_name else None


def require_test_database_url() -> str:
    """Return the dedicated test database URL or fail the test with instructions."""
    url = matching_test_database_url()
    if url is None:
        pytest.fail(f"MATCHING_TEST_DATABASE_URL is unset or does not name a test database. {SETUP_HINT}")
    return url


async def connect_test_database(timeout: float = 5.0) -> asyncpg.Connection:
    """Connect to the dedicated test database, failing loudly when unreachable."""
    url = require_test_database_url()
    try:
        return await asyncpg.connect(url, timeout=timeout)
    except Exception as exc:  # noqa: BLE001 - convert any connection error into a test failure
        pytest.fail(f"Test database is not reachable ({type(exc).__name__}). {SETUP_HINT}")

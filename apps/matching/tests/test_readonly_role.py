"""AD-2 / T1.01: the matching service's database role must be read-only.

Runs against the dedicated, migrated test database. It assumes the role
``routeride_matching_ro`` created by the matching-foundation migration and
asserts, at the PostgreSQL privilege level (not by convention), that SELECT is
allowed and every kind of write is denied.
"""

from __future__ import annotations

import asyncpg
import pytest
from _database import connect_test_database

ROLE = "routeride_matching_ro"

# Tables the matching service reads: AD-2 plus the service-area/run tables added
# by the ADR-011 amendment.
READ_TABLES = [
    "driver_profiles",
    "driver_matching_stats",
    "reviews",
    "subscriptions",
    "driver_schedule_slots",
    "riders",
    "driver_availability",
    "recurring_runs",
    "run_assignments",
    "run_stops",
    "recurring_run_migration_issues",
]


async def _first_column(conn: asyncpg.Connection, table: str) -> str:
    column = await conn.fetchval(
        "SELECT attname FROM pg_attribute WHERE attrelid = $1::regclass "
        "AND attnum > 0 AND NOT attisdropped ORDER BY attnum LIMIT 1",
        f"public.{table}",
    )
    assert column is not None, f"{table} has no columns"
    return str(column)


@pytest.mark.db
async def test_matching_role_exists_and_can_only_read() -> None:
    conn = await connect_test_database()
    try:
        assert await conn.fetchval("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1)", ROLE), (
            f"role {ROLE} is missing; the matching-foundation migration was not applied"
        )
        assert not await conn.fetchval("SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = $1", ROLE)
        assert not await conn.fetchval("SELECT rolcanlogin FROM pg_roles WHERE rolname = $1", ROLE), (
            "the group role must stay NOLOGIN; services connect through a separate login role"
        )

        tx = conn.transaction()
        await tx.start()
        try:
            await conn.execute(f"SET LOCAL ROLE {ROLE}")
            for table in READ_TABLES:
                column = await _first_column(conn, table)
                # SELECT must work.
                await conn.fetchval(f"SELECT COUNT(*) FROM public.{table}")
                # Every write form must be rejected by PostgreSQL privileges.
                writes = {
                    "INSERT": f"INSERT INTO public.{table} DEFAULT VALUES",
                    "UPDATE": f'UPDATE public.{table} SET "{column}" = "{column}" WHERE false',
                    "DELETE": f"DELETE FROM public.{table} WHERE false",
                    "TRUNCATE": f"TRUNCATE public.{table}",
                }
                for kind, statement in writes.items():
                    try:
                        async with conn.transaction():  # savepoint keeps the outer tx usable
                            await conn.execute(statement)
                    except asyncpg.InsufficientPrivilegeError:
                        continue
                    pytest.fail(f"{ROLE} was allowed to {kind} on {table}")
            # No DDL either.
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                async with conn.transaction():
                    await conn.execute("CREATE TABLE public.ro_probe_should_fail (x int)")
        finally:
            await tx.rollback()
    finally:
        await conn.close()

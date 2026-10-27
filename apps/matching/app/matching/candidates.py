"""Spatial candidate filter and eligibility accounting (Phase 1A Task 1.02).

Implements:
1. Candidate retrieval query over driver_profiles enforcing:
   - E1 (status = APPROVED)
   - E2 (defensive geometry precedence via deterministic CASE classification)
   - E3 (ST_DWithin on PostGIS geography for pickup and destination within radii)
   - E5 (operating_days array overlap)
2. Decoupled LATERAL aggregates eliminating the TRD §4.1 3x4 Cartesian product bug:
   - reviews: independent lateral join for true avgRating and reviewCount
   - subscriptions: independent lateral join for activeSubscriptionsCount
3. Spatial eligibility accounting pipeline (E1 -> E2 -> E3 -> E5) returning observable
   SpatialExclusionDiagnostics for firstFailureCounts and emitting canonical diagnostic logs.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import time
from typing import Any
from uuid import UUID

import asyncpg
import structlog
from shapely import wkb
from shapely.geometry.base import BaseGeometry

from app.schemas.internal_search import InternalSearchRequest

logger = structlog.get_logger(service="routeride-matching")


@dataclass(frozen=True, slots=True)
class CandidateDriver:
    """Represents an eligible driver corridor passing spatial filtering (E1, E2, E3, E5)."""

    driver_profile_id: UUID
    user_id: UUID
    seat_capacity: int
    operating_days: list[int]
    acceptance_rate: float | None
    route_geometry: BaseGeometry  # Deserialized Shapely LineString for T1.03 direction projection
    pickup_distance_meters: float
    dest_distance_meters: float
    avg_rating: float | None
    review_count: int
    active_subscriptions_count: (
        int  # Informational profile metadata only; NOT E6 capacity occupancy
    )
    typical_departure_time: time | None
    departure_observation_count: int
    accepted_count: int = 0
    eligible_count: int = 0


@dataclass(frozen=True, slots=True)
class SpatialExclusionDiagnostics:
    """Observed first-failure counts from spatial candidate evaluation (AD-11)."""

    driver_status_failures: int  # E1
    invalid_geometry_failures: int  # E2 total
    null_geometry_count: int  # E2 tier 1
    empty_geometry_count: int  # E2 tier 2
    wrong_srid_count: int  # E2 tier 3
    non_simple_count: int  # E2 tier 4
    invalid_geometry_count: int  # E2 tier 5
    distance_failures: int  # E3
    direction_failures: int  # E4 (evaluated strictly after E3)
    operating_day_failures: int  # E5 (evaluated strictly after E4 per AD-11 canonical order)
    passed_e5_count: int  # Passed E1, E2, E3, E4, and E5


def parse_route_geometry(ewkb_data: bytes | str | None) -> BaseGeometry:
    """Defensively deserialize EWKB data into a Shapely geometry.

    PostGIS is the authoritative authority for E2 validation.
    Shapely is used downstream solely for corridor direction projection (T1.03).
    """
    if ewkb_data is None:
        raise ValueError("route_geometry cannot be None")

    if isinstance(ewkb_data, str):
        # Hex-encoded string
        raw_bytes = bytes.fromhex(ewkb_data)
    else:
        raw_bytes = ewkb_data

    try:
        geom = wkb.loads(raw_bytes)
    except Exception as exc:
        raise ValueError(f"Failed to deserialize route geometry: {exc}") from exc

    if geom.is_empty:
        raise ValueError("route_geometry cannot be empty")

    return geom


CANDIDATE_RETRIEVAL_SQL = """
WITH geometry_classification AS (
  SELECT
    dp.*,
    CASE
      WHEN dp.route_polyline IS NULL
        THEN 'NULL_GEOMETRY'
      WHEN ST_IsEmpty(dp.route_polyline::geometry)
        THEN 'EMPTY_GEOMETRY'
      WHEN ST_SRID(dp.route_polyline) <> 4326
        THEN 'WRONG_SRID'
      WHEN NOT ST_IsSimple(dp.route_polyline::geometry)
        THEN 'NON_SIMPLE'
      WHEN NOT ST_IsValid(dp.route_polyline::geometry)
        THEN 'INVALID'
      ELSE NULL
    END AS geometry_failure
  FROM driver_profiles dp
)
SELECT
  gc.id AS driver_profile_id,
  gc.user_id,
  gc.seat_capacity,
  gc.operating_days,
  gc.acceptance_rate,
  ST_AsEWKB(gc.route_polyline::geometry) AS route_geometry_ewkb,
  ST_Distance(
    gc.route_polyline::geography,
    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
  ) AS pickup_distance_meters,
  ST_Distance(
    gc.route_polyline::geography,
    ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
  ) AS dest_distance_meters,
  rev.avg_rating,
  rev.review_count,
  subs.active_subscriptions_count,
  dms.typical_departure_time,
  dms.observation_count AS departure_observation_count,
  gc.accepted_request_count AS accepted_count,
  gc.eligible_request_count AS eligible_count
FROM geometry_classification gc
-- Decoupled review aggregate (eliminates 3x4 Cartesian product bug)
LEFT JOIN LATERAL (
  SELECT
    ROUND(AVG(r.rating)::numeric, 2)::float AS avg_rating,
    COUNT(r.id)::int AS review_count
  FROM reviews r
  WHERE r.target_id = gc.user_id
) rev ON TRUE
-- Decoupled subscription aggregate (informational only; NOT E6 capacity occupancy)
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT s.id)::int AS active_subscriptions_count
  FROM subscriptions s
  WHERE s.driver_profile_id = gc.id
    AND s.status = 'ACTIVE'
) subs ON TRUE
-- Day-level departure statistics (AD-8, T1.06 contract)
LEFT JOIN LATERAL (
  SELECT
    dms.typical_departure_time,
    dms.observation_count
  FROM driver_matching_stats dms
  WHERE dms.driver_profile_id = gc.id
    AND dms.operating_day = $5
) dms ON TRUE
WHERE gc.status = 'APPROVED'
  AND gc.geometry_failure IS NULL
  AND $5 = ANY(gc.operating_days)
  AND ST_DWithin(
    gc.route_polyline::geography,
    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
    $6
  )
  AND ST_DWithin(
    gc.route_polyline::geography,
    ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
    $7
  );
"""

SPATIAL_EXCLUSIONS_SQL = """
WITH status_and_geom AS (
  SELECT
    COUNT(*) FILTER (WHERE status <> 'APPROVED')::int AS driver_status_failures,
    COUNT(*) FILTER (WHERE status = 'APPROVED' AND route_polyline IS NULL)::int AS null_geometry_count,
    COUNT(*) FILTER (WHERE status = 'APPROVED' AND route_polyline IS NOT NULL AND ST_IsEmpty(route_polyline::geometry))::int AS empty_geometry_count,
    COUNT(*) FILTER (WHERE status = 'APPROVED' AND route_polyline IS NOT NULL AND NOT ST_IsEmpty(route_polyline::geometry) AND ST_SRID(route_polyline) <> 4326)::int AS wrong_srid_count,
    COUNT(*) FILTER (WHERE status = 'APPROVED' AND route_polyline IS NOT NULL AND NOT ST_IsEmpty(route_polyline::geometry) AND ST_SRID(route_polyline) = 4326 AND NOT ST_IsSimple(route_polyline::geometry))::int AS non_simple_count,
    COUNT(*) FILTER (WHERE status = 'APPROVED' AND route_polyline IS NOT NULL AND NOT ST_IsEmpty(route_polyline::geometry) AND ST_SRID(route_polyline) = 4326 AND ST_IsSimple(route_polyline::geometry) AND NOT ST_IsValid(route_polyline::geometry))::int AS invalid_geometry_count,
    COUNT(*) FILTER (WHERE status = 'APPROVED' AND route_polyline IS NOT NULL AND NOT ST_IsEmpty(route_polyline::geometry) AND ST_SRID(route_polyline) = 4326 AND ST_IsSimple(route_polyline::geometry) AND ST_IsValid(route_polyline::geometry))::int AS approved_valid_count
  FROM driver_profiles
),
spatial_passed AS (
  SELECT
    dp.operating_days,
    CASE
      WHEN $8 IN ('ONE_WAY', 'ROUND_TRIP') THEN
        ST_LineLocatePoint(dp.route_polyline::geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geometry) >=
        ST_LineLocatePoint(dp.route_polyline::geometry, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geometry) - 1e-9
      ELSE TRUE
    END AS direction_failed
  FROM driver_profiles dp
  WHERE dp.status = 'APPROVED'
    AND dp.route_polyline IS NOT NULL
    AND NOT ST_IsEmpty(dp.route_polyline::geometry)
    AND ST_SRID(dp.route_polyline) = 4326
    AND ST_IsSimple(dp.route_polyline::geometry)
    AND ST_IsValid(dp.route_polyline::geometry)
    AND ST_DWithin(
      dp.route_polyline::geography,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      $6
    )
    AND ST_DWithin(
      dp.route_polyline::geography,
      ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
      $7
    )
),
spatial_counts AS (
  SELECT
    COUNT(*) AS total_passed_e3,
    COUNT(*) FILTER (WHERE direction_failed)::int AS direction_failures,
    COUNT(*) FILTER (WHERE NOT direction_failed AND NOT ($5 = ANY(operating_days)))::int AS operating_day_failures,
    COUNT(*) FILTER (WHERE NOT direction_failed AND ($5 = ANY(operating_days)))::int AS passed_e5_count
  FROM spatial_passed
)
SELECT
  sg.driver_status_failures,
  (sg.null_geometry_count + sg.empty_geometry_count + sg.wrong_srid_count + sg.non_simple_count + sg.invalid_geometry_count)::int AS invalid_geometry_failures,
  sg.null_geometry_count,
  sg.empty_geometry_count,
  sg.wrong_srid_count,
  sg.non_simple_count,
  sg.invalid_geometry_count,
  (sg.approved_valid_count - sc.total_passed_e3)::int AS distance_failures,
  sc.direction_failures,
  sc.operating_day_failures,
  sc.passed_e5_count
FROM status_and_geom sg
CROSS JOIN spatial_counts sc;
"""


async def find_spatial_candidates(
    pool: asyncpg.Pool,
    request: InternalSearchRequest,
) -> list[CandidateDriver]:
    """Execute the spatial candidate query returning eligible drivers with corridor metrics."""
    # Binding order: $1=pickupLng, $2=pickupLat, $3=destLng, $4=destLat, $5=day, $6=pickupRadius, $7=destRadius
    params = [
        request.pickupLng,
        request.pickupLat,
        request.destLng,
        request.destLat,
        request.day,
        request.pickupRadiusMeters,
        request.destRadiusMeters,
    ]

    async with pool.acquire() as conn:
        rows = await conn.fetch(CANDIDATE_RETRIEVAL_SQL, *params)

    candidates: list[CandidateDriver] = []
    for r in rows:
        acceptance_rate = float(r["acceptance_rate"]) if r["acceptance_rate"] is not None else None
        avg_rating = float(r["avg_rating"]) if r["avg_rating"] is not None else None
        route_geom = parse_route_geometry(r["route_geometry_ewkb"])

        candidates.append(
            CandidateDriver(
                driver_profile_id=UUID(str(r["driver_profile_id"])),
                user_id=UUID(str(r["user_id"])),
                seat_capacity=int(r["seat_capacity"]),
                operating_days=list(r["operating_days"]),
                acceptance_rate=acceptance_rate,
                route_geometry=route_geom,
                pickup_distance_meters=float(r["pickup_distance_meters"]),
                dest_distance_meters=float(r["dest_distance_meters"]),
                avg_rating=avg_rating,
                review_count=int(r["review_count"] or 0),
                active_subscriptions_count=int(r["active_subscriptions_count"] or 0),
                typical_departure_time=r["typical_departure_time"],
                departure_observation_count=int(r["departure_observation_count"] or 0),
                accepted_count=int(r["accepted_count"] or 0) if "accepted_count" in r else 0,
                eligible_count=int(r["eligible_count"] or 0) if "eligible_count" in r else 0,
            )
        )

    return candidates


async def count_spatial_exclusions(
    pool: asyncpg.Pool,
    request: InternalSearchRequest,
) -> SpatialExclusionDiagnostics:
    """Execute the eligibility accounting query evaluating E1 -> E2 -> E3 -> E5."""
    params = [
        request.pickupLng,
        request.pickupLat,
        request.destLng,
        request.destLat,
        request.day,
        request.pickupRadiusMeters,
        request.destRadiusMeters,
        request.subscriptionType,
    ]

    async with pool.acquire() as conn:
        row = await conn.fetchrow(SPATIAL_EXCLUSIONS_SQL, *params)

    if row is None:
        return SpatialExclusionDiagnostics(
            driver_status_failures=0,
            invalid_geometry_failures=0,
            null_geometry_count=0,
            empty_geometry_count=0,
            wrong_srid_count=0,
            non_simple_count=0,
            invalid_geometry_count=0,
            distance_failures=0,
            direction_failures=0,
            operating_day_failures=0,
            passed_e5_count=0,
        )

    diagnostics = SpatialExclusionDiagnostics(
        driver_status_failures=int(row["driver_status_failures"] or 0),
        invalid_geometry_failures=int(row["invalid_geometry_failures"] or 0),
        null_geometry_count=int(row["null_geometry_count"] or 0),
        empty_geometry_count=int(row["empty_geometry_count"] or 0),
        wrong_srid_count=int(row["wrong_srid_count"] or 0),
        non_simple_count=int(row["non_simple_count"] or 0),
        invalid_geometry_count=int(row["invalid_geometry_count"] or 0),
        distance_failures=int(row["distance_failures"] or 0),
        direction_failures=int(row["direction_failures"] or 0),
        operating_day_failures=int(row["operating_day_failures"] or 0),
        passed_e5_count=int(row["passed_e5_count"] or 0),
    )

    # Emit canonical diagnostic logs when geometry exclusions occur (AD-11)
    if diagnostics.null_geometry_count > 0:
        logger.warning(
            "matching.excluded.null_geometry",
            count=diagnostics.null_geometry_count,
            exclusion_reason="INVALID_GEOMETRY",
        )
    if diagnostics.empty_geometry_count > 0:
        logger.warning(
            "matching.excluded.empty_geometry",
            count=diagnostics.empty_geometry_count,
            exclusion_reason="INVALID_GEOMETRY",
        )
    if diagnostics.wrong_srid_count > 0:
        logger.warning(
            "matching.excluded.wrong_srid",
            count=diagnostics.wrong_srid_count,
            exclusion_reason="INVALID_GEOMETRY",
        )
    if diagnostics.non_simple_count > 0:
        logger.warning(
            "matching.excluded.non_simple_geometry",
            count=diagnostics.non_simple_count,
            exclusion_reason="INVALID_GEOMETRY",
        )
    if diagnostics.invalid_geometry_count > 0:
        logger.warning(
            "matching.excluded.invalid_geometry",
            count=diagnostics.invalid_geometry_count,
            exclusion_reason="INVALID_GEOMETRY",
        )

    return diagnostics


async def explain_candidate_query(
    pool: asyncpg.Pool,
    request: InternalSearchRequest,
    analyze: bool = False,
) -> list[dict[str, Any]]:
    """Execute EXPLAIN (FORMAT JSON) on the candidate retrieval query for plan verification."""
    prefix = "EXPLAIN (ANALYZE, FORMAT JSON)" if analyze else "EXPLAIN (FORMAT JSON)"
    explain_sql = f"{prefix} {CANDIDATE_RETRIEVAL_SQL}"

    params = [
        request.pickupLng,
        request.pickupLat,
        request.destLng,
        request.destLat,
        request.day,
        request.pickupRadiusMeters,
        request.destRadiusMeters,
    ]

    async with pool.acquire() as conn:
        explain_output = await conn.fetchval(explain_sql, *params)

    if isinstance(explain_output, str):
        return json.loads(explain_output)  # type: ignore[no-any-return]
    return explain_output  # type: ignore[no-any-return]

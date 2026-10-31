"""Read-only v2 discovery: operating city filters, score orders suggestions.

Detailed road-time feasibility is deliberately unknown during search. Matching
never makes synchronous provider calls here and never reserves a seat.
"""

from __future__ import annotations

from datetime import time
from time import perf_counter

import asyncpg

from app.config import service_bbox, settings
from app.matching.observability import record_discovery_decision
from app.matching.scoring import (
    compute_acceptance_score,
    compute_capacity_score,
    compute_composite_score,
    compute_proximity_score,
    compute_rating_score,
)
from app.schemas.discovery import (
    DiscoveryCandidate,
    DiscoveryMatch,
    DiscoveryPagination,
    DiscoveryRequest,
    DiscoveryResponse,
)

POLICY_VERSION = f"city-v2.2:{settings.MATCHING_CONFIG_VERSION}"

# A single query gives one consistent read snapshot. Unlike v1 this query has no
# distance/direction veto or top-N truncation. Full-run windows exclude capacity
# only when every compatible run is full; other insertions require road review.
DISCOVERY_SQL = """
WITH requested_legs AS (
  SELECT 'DEPARTURE' AS leg, $6::time AS requested_time
  UNION ALL SELECT 'PICKUP', $8::time WHERE $7 = 'ROUND_TRIP'
), eligible AS (
 SELECT dp.*
 FROM driver_profiles dp
 WHERE dp.status = 'APPROVED' AND dp.accepting_requests
   AND NOT dp.coverage_setup_required
   AND dp.starting_location IS NOT NULL
   AND dp.operating_city = 'PK-KHI'
   AND ((dp.route_state = 'UNSET' AND dp.route_polyline IS NULL)
     OR (dp.route_state = 'ESTABLISHED' AND dp.route_polyline IS NOT NULL
       AND NOT ST_IsEmpty(dp.route_polyline::geometry)
       AND ST_GeometryType(dp.route_polyline::geometry) = 'ST_LineString'
       AND ST_SRID(dp.route_polyline) = 4326
       AND ST_IsValid(dp.route_polyline::geometry)
       AND ST_IsSimple(dp.route_polyline::geometry)))
   AND NOT EXISTS (
     SELECT 1 FROM requested_legs rl WHERE NOT EXISTS (
       SELECT 1 FROM driver_availability a
       WHERE a.driver_profile_id = dp.id AND a.operating_day = $5
         AND a.window_start <= rl.requested_time AND a.window_end >= rl.requested_time
     )
   )
)
SELECT e.id AS driver_profile_id, e.route_state, e.seat_capacity,
 CASE WHEN e.route_state = 'ESTABLISHED' THEN ST_Distance(e.route_polyline::geography,
   ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) END AS pickup_distance_meters,
 CASE WHEN e.route_state = 'ESTABLISHED' THEN ST_Distance(e.route_polyline::geography,
   ST_SetSRID(ST_MakePoint($3,$4),4326)::geography) END AS dest_distance_meters,
 rev.avg_rating, rev.review_count, capacity.available_seats,
 e.accepted_request_count AS accepted_count,
 e.eligible_request_count AS terminal_count, timing.timing_score
FROM eligible e
LEFT JOIN LATERAL (
 SELECT AVG(r.rating)::float AS avg_rating, COUNT(*)::int AS review_count
 FROM reviews r WHERE r.target_id = e.user_id
) rev ON TRUE
CROSS JOIN LATERAL (
 SELECT MIN(leg_capacity.seats)::int AS available_seats
 FROM requested_legs rl
 CROSS JOIN LATERAL (
   SELECT CASE WHEN EXISTS (
     SELECT 1 FROM recurring_runs legacy WHERE legacy.driver_profile_id=e.id
       AND legacy.operating_day=$5 AND legacy.leg_type::text=rl.leg AND legacy.needs_review
       AND (legacy.effective_to IS NULL OR legacy.effective_to >= CURRENT_DATE)
   ) THEN e.seat_capacity - (
     SELECT COUNT(DISTINCT ra.subscription_id)::int
     FROM recurring_runs legacy JOIN run_assignments ra ON ra.run_id=legacy.id
       JOIN subscriptions s ON s.id=ra.subscription_id
     WHERE legacy.driver_profile_id=e.id AND legacy.operating_day=$5
       AND legacy.leg_type::text=rl.leg AND s.status='ACTIVE'
       AND (legacy.effective_to IS NULL OR legacy.effective_to >= CURRENT_DATE)
       AND (ra.effective_to IS NULL OR ra.effective_to >= CURRENT_DATE)
   ) ELSE COALESCE(MAX(LEAST(e.seat_capacity, run.seat_capacity) - (
     SELECT COUNT(DISTINCT ra.subscription_id)::int
     FROM run_assignments ra JOIN subscriptions s ON s.id = ra.subscription_id
     WHERE ra.run_id = run.id AND s.status = 'ACTIVE'
       AND (ra.effective_to IS NULL OR ra.effective_to >= CURRENT_DATE)
   )), e.seat_capacity) END::int AS seats
   FROM recurring_runs run
   WHERE run.driver_profile_id = e.id AND run.operating_day = $5
     AND run.leg_type::text = rl.leg
     AND (run.effective_to IS NULL OR run.effective_to >= CURRENT_DATE)
     AND (run.needs_review OR (run.starts_at <= rl.requested_time AND run.ends_at >= rl.requested_time))
 ) leg_capacity
) capacity
CROSS JOIN LATERAL (
 SELECT AVG(COALESCE((
   SELECT MAX(CASE WHEN $9::float > 0 THEN GREATEST(0, 1 -
     ABS(EXTRACT(EPOCH FROM (run.starts_at - rl.requested_time))) / (60 * $9::float))
     WHEN run.starts_at = rl.requested_time THEN 1 ELSE 0 END)
   FROM recurring_runs run
   WHERE run.driver_profile_id=e.id AND run.operating_day=$5
     AND run.leg_type::text=rl.leg AND NOT run.needs_review
     AND run.starts_at IS NOT NULL
     AND (run.effective_to IS NULL OR run.effective_to >= CURRENT_DATE)
     AND EXISTS (SELECT 1 FROM run_assignments ra JOIN subscriptions s ON s.id=ra.subscription_id
       WHERE ra.run_id=run.id AND s.status='ACTIVE'
         AND (ra.effective_to IS NULL OR ra.effective_to >= CURRENT_DATE))
 ), 0.5))::float AS timing_score FROM requested_legs rl
) timing
WHERE capacity.available_seats > 0
ORDER BY e.id
"""


def rank_discovery_candidates(
    candidates: list[DiscoveryCandidate], request: DiscoveryRequest,
) -> DiscoveryResponse:
    """Rank every available driver, then paginate, retaining exact tie precision."""
    matches: list[DiscoveryMatch] = []
    for candidate in candidates:
        proximity = 0.5
        if candidate.pickupDistanceMeters is not None and candidate.destDistanceMeters is not None:
            _, _, proximity = compute_proximity_score(
                candidate.pickupDistanceMeters, candidate.destDistanceMeters,
                settings.MATCHING_PICKUP_RADIUS_M, settings.MATCHING_DEST_RADIUS_M,
            )
        score, breakdown = compute_composite_score(
            proximity, candidate.timingScore,
            compute_rating_score(candidate.avgRating, candidate.reviewCount,
                                 settings.MATCHING_RATING_PRIOR, settings.MATCHING_RATING_WEIGHT),
            compute_capacity_score(candidate.availableSeats, candidate.seatCapacity),
            compute_acceptance_score(candidate.acceptedCount, candidate.terminalCount,
                                     settings.MATCHING_ACCEPTANCE_PRIOR, settings.MATCHING_ACCEPTANCE_WEIGHT),
            settings.MATCHING_WEIGHT_PROXIMITY, settings.MATCHING_WEIGHT_TIMING,
            settings.MATCHING_WEIGHT_RATING, settings.MATCHING_WEIGHT_CAPACITY,
            settings.MATCHING_WEIGHT_ACCEPTANCE,
        )
        matches.append(DiscoveryMatch(
            **candidate.model_dump(), compositeScore=score, scoreBreakdown=breakdown,
        ))
    matches.sort(key=lambda match: (-match.compositeScore, str(match.driverProfileId)))
    offset = (request.page - 1) * request.pageSize
    return DiscoveryResponse(
        results=matches[offset:offset + request.pageSize],
        pagination=DiscoveryPagination(page=request.page, pageSize=request.pageSize,
                                       total=len(matches), hasMore=offset + request.pageSize < len(matches)),
        policyVersion=POLICY_VERSION,
    )


async def execute_discovery(pool: asyncpg.Pool, request: DiscoveryRequest) -> DiscoveryResponse:
    """Read declared availability/capacity; leave uncomputed timing marked for review."""
    started = perf_counter()
    for lat, lng in ((request.pickupLat, request.pickupLng), (request.destLat, request.destLng)):
        if not (service_bbox.min_lat <= lat <= service_bbox.max_lat
                and service_bbox.min_lon <= lng <= service_bbox.max_lon):
            record_discovery_decision(request.subscriptionType, total=0, route_free=0,
                                      duration_ms=(perf_counter() - started) * 1000)
            return rank_discovery_candidates([], request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            DISCOVERY_SQL, request.pickupLng, request.pickupLat, request.destLng,
            request.destLat, request.day, time.fromisoformat(request.departureTime),
            request.subscriptionType,
            time.fromisoformat(request.pickupTime) if request.pickupTime else None,
            settings.MAX_TIMING_DIFF_MINUTES,
        )
    candidates = [DiscoveryCandidate(
        driverProfileId=row["driver_profile_id"], routeState=row["route_state"],
        pickupDistanceMeters=row["pickup_distance_meters"],
        destDistanceMeters=row["dest_distance_meters"], availableSeats=row["available_seats"],
        seatCapacity=row["seat_capacity"], avgRating=row["avg_rating"],
        reviewCount=row["review_count"], acceptedCount=row["accepted_count"],
        terminalCount=row["terminal_count"],
        timingScore=row.get("timing_score", 0.5),
    ) for row in rows]
    response = rank_discovery_candidates(candidates, request)
    record_discovery_decision(request.subscriptionType, total=len(candidates),
                              route_free=sum(candidate.routeState == "UNSET" for candidate in candidates),
                              duration_ms=(perf_counter() - started) * 1000)
    return response

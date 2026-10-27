"""Scoring and deterministic ranking module (Phase 1A Task 1.06).

Implements Stage E8 (Scoring & Ranking) of canonical matching (PRD §7.4, TRD §4.1, AD-8, AD-11, AD-14):
1. Normalizes five independent component signals into [0.0, 1.0]:
   - Proximity score (40%): Independent radius normalization per pickup/dest radius.
   - Timing score (25%): Departure time difference on requested operating day,
     falling back to neutral 0.500 when observations < 3.
   - Rating score (20%): Empirical Bayesian shrinkage toward neutral 0.700 (3.5 stars) with weight 5.
   - Capacity headroom (10%): Available seats divided by vehicle seat capacity.
   - Acceptance rate (5%): Empirical Bayesian shrinkage toward neutral 0.800 (80%) with weight 5
     using canonical request counts (AD-8).
2. Deterministic ranking & stable tie-breaking:
   - Evaluates composite score with unrounded full float precision.
   - Sorts primary by unrounded composite score descending, then secondary by
     driver_profile_id ascending (lexicographical UUID string order).
   - Preserves exact ordering across repeated executions and arbitrary input order.
   - Slices top candidates to configurable limit (default 20 via MATCHING_MAX_RESULTS).
3. Pure computational stage:
   - Consumes only data already established by Stages E1–E7.
   - Executes zero database queries and zero external API calls.
   - Maps duration is excluded from scoring and strictly isolated to downstream display enrichment (AD-14).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from uuid import UUID

import structlog

from app.config import settings
from app.matching.candidates import CandidateDriver
from app.matching.capacity import CapacityCheckResult
from app.matching.service_window import time_str_to_minutes
from app.schemas.internal_search import InternalSearchRequest, ScoreBreakdown

logger = structlog.get_logger(service="routeride-matching")

__all__ = [
    "ScoredCandidateMatch",
    "compute_acceptance_score",
    "compute_capacity_score",
    "compute_composite_score",
    "compute_proximity_score",
    "compute_rating_score",
    "compute_timing_score",
    "ranking_sort_key",
    "score_and_rank_candidates",
]


def compute_proximity_score(
    pickup_dist_m: float,
    dest_dist_m: float,
    r_pickup_m: float,
    r_dest_m: float,
) -> tuple[float, float, float]:
    """Calculate independent radius-normalized proximity scores in [0.0, 1.0] (PRD §7.4).

    Returns:
        tuple of (pickup_score, dest_score, proximity_score)
    """
    if r_pickup_m <= 0.0 or r_dest_m <= 0.0:
        return 0.0, 0.0, 0.0

    pickup_score = max(0.0, min(1.0, 1.0 - pickup_dist_m / r_pickup_m))
    dest_score = max(0.0, min(1.0, 1.0 - dest_dist_m / r_dest_m))
    proximity_score = (pickup_score + dest_score) / 2.0
    return pickup_score, dest_score, proximity_score


def compute_timing_score(
    typical_departure: time | None,
    observation_count: int,
    requested_time: str,
    max_diff_minutes: float = 60.0,
) -> float:
    """Calculate departure timing score using day-level driver_matching_stats (AD-8).

    - If observations < 3 or typical_departure is None: returns neutral fallback 0.500.
    - Otherwise compares departure time with requested time up to max_diff_minutes (default 60m).
    """
    if observation_count < 3 or typical_departure is None:
        return 0.500

    dep_min = typical_departure.hour * 60 + typical_departure.minute
    req_min = time_str_to_minutes(requested_time)
    diff_minutes = abs(dep_min - req_min)

    if max_diff_minutes <= 0.0:
        return 1.0 if diff_minutes == 0 else 0.0

    score = 1.0 - diff_minutes / max_diff_minutes
    return max(0.0, min(1.0, score))


def compute_rating_score(
    avg_rating: float | None,
    review_count: int,
    prior: float = 0.7,
    weight: float = 5.0,
) -> float:
    """Calculate driver rating score via empirical Bayesian shrinkage (AD-8).

    Formula:
        (N_reviews * (avgRating / 5.0) + weight * prior) / (N_reviews + weight)
    - If review_count <= 0 or avg_rating is None: returns neutral prior (0.700).
    """
    if review_count <= 0 or avg_rating is None:
        return prior

    normalized_rating = max(0.0, min(1.0, avg_rating / 5.0))
    score = (review_count * normalized_rating + weight * prior) / (review_count + weight)
    return max(0.0, min(1.0, score))


def compute_capacity_score(
    available_seats: int,
    seat_capacity: int,
) -> float:
    """Calculate capacity headroom score as remaining available seats ratio (AD-10)."""
    if seat_capacity <= 0:
        return 0.0
    score = available_seats / seat_capacity
    return max(0.0, min(1.0, score))


def compute_acceptance_score(
    accepted_count: int,
    eligible_count: int,
    prior: float = 0.8,
    weight: float = 5.0,
) -> float:
    """Calculate driver acceptance score via empirical Bayesian shrinkage using exact counts (AD-8).

    Formula:
        (accepted_count + weight * prior) / (eligible_count + weight)
    - If eligible_count <= 0: returns neutral prior (0.800).
    """
    if eligible_count <= 0:
        return prior

    score = (accepted_count + weight * prior) / (eligible_count + weight)
    return max(0.0, min(1.0, score))


def compute_composite_score(
    proximity_score: float,
    timing_score: float,
    rating_score: float,
    capacity_score: float,
    acceptance_score: float,
    weight_proximity: float = 0.40,
    weight_timing: float = 0.25,
    weight_rating: float = 0.20,
    weight_capacity: float = 0.10,
    weight_acceptance: float = 0.05,
) -> tuple[float, ScoreBreakdown]:
    """Compute weighted composite score and structured audit breakdown.

    Returns:
        tuple of (composite_score_exact, ScoreBreakdown)
    """
    composite_exact = (
        (weight_proximity * proximity_score)
        + (weight_timing * timing_score)
        + (weight_rating * rating_score)
        + (weight_capacity * capacity_score)
        + (weight_acceptance * acceptance_score)
    )
    composite_clamped = max(0.0, min(1.0, composite_exact))

    breakdown = ScoreBreakdown(
        proximityScore=round(proximity_score, 4),
        timingScore=round(timing_score, 4),
        ratingScore=round(rating_score, 4),
        capacityScore=round(capacity_score, 4),
        acceptanceScore=round(acceptance_score, 4),
    )
    return composite_clamped, breakdown


@dataclass(frozen=True, slots=True)
class ScoredCandidateMatch:
    """Internal candidate match with exact full-precision floating-point scores."""

    driver_profile_id: UUID
    composite_score_exact: float  # Full-precision unrounded float for ranking
    score_breakdown: ScoreBreakdown
    available_seats: int
    seat_capacity: int
    pickup_distance_meters: float
    dest_distance_meters: float
    avg_rating: float | None
    review_count: int


def ranking_sort_key(match: ScoredCandidateMatch) -> tuple[float, str]:
    """Sort key for deterministic ranking.

    1. Primary: unrounded composite score descending (-match.composite_score_exact)
    2. Secondary: driver profile ID ascending (str(match.driver_profile_id))
    """
    return (-match.composite_score_exact, str(match.driver_profile_id))


def score_and_rank_candidates(
    candidates: list[CandidateDriver],
    capacity_results: dict[UUID, CapacityCheckResult],
    request: InternalSearchRequest,
    limit: int | None = None,
) -> list[ScoredCandidateMatch]:
    """Score and rank all eligible candidate drivers deterministically (Stage E8).

    Consumes data established by Stages E1–E7. Executes zero database queries.
    Maps duration is deliberately excluded from scoring (AD-14).

    Returns:
        Ranked list of ScoredCandidateMatch objects sliced to limit (default 20).
    """
    if not candidates:
        return []

    max_results = limit if limit is not None else settings.MATCHING_MAX_RESULTS
    r_pickup = request.pickupRadiusMeters
    r_dest = request.destRadiusMeters
    requested_time = request.departureTime

    scored: list[ScoredCandidateMatch] = []
    for candidate in candidates:
        cap_res = capacity_results.get(candidate.driver_profile_id)
        available_seats = (
            cap_res.available_seats
            if cap_res is not None
            else candidate.seat_capacity - candidate.active_subscriptions_count
        )

        _, _, proximity_score = compute_proximity_score(
            pickup_dist_m=candidate.pickup_distance_meters,
            dest_dist_m=candidate.dest_distance_meters,
            r_pickup_m=r_pickup,
            r_dest_m=r_dest,
        )

        timing_score = compute_timing_score(
            typical_departure=candidate.typical_departure_time,
            observation_count=candidate.departure_observation_count,
            requested_time=requested_time,
            max_diff_minutes=settings.MAX_TIMING_DIFF_MINUTES,
        )

        rating_score = compute_rating_score(
            avg_rating=candidate.avg_rating,
            review_count=candidate.review_count,
            prior=settings.MATCHING_RATING_PRIOR,
            weight=settings.MATCHING_RATING_WEIGHT,
        )

        capacity_score = compute_capacity_score(
            available_seats=available_seats,
            seat_capacity=candidate.seat_capacity,
        )

        acceptance_score = compute_acceptance_score(
            accepted_count=candidate.accepted_count,
            eligible_count=candidate.eligible_count,
            prior=settings.MATCHING_ACCEPTANCE_PRIOR,
            weight=settings.MATCHING_ACCEPTANCE_WEIGHT,
        )

        composite_exact, breakdown = compute_composite_score(
            proximity_score=proximity_score,
            timing_score=timing_score,
            rating_score=rating_score,
            capacity_score=capacity_score,
            acceptance_score=acceptance_score,
            weight_proximity=settings.MATCHING_WEIGHT_PROXIMITY,
            weight_timing=settings.MATCHING_WEIGHT_TIMING,
            weight_rating=settings.MATCHING_WEIGHT_RATING,
            weight_capacity=settings.MATCHING_WEIGHT_CAPACITY,
            weight_acceptance=settings.MATCHING_WEIGHT_ACCEPTANCE,
        )

        match = ScoredCandidateMatch(
            driver_profile_id=candidate.driver_profile_id,
            composite_score_exact=composite_exact,
            score_breakdown=breakdown,
            available_seats=available_seats,
            seat_capacity=candidate.seat_capacity,
            pickup_distance_meters=candidate.pickup_distance_meters,
            dest_distance_meters=candidate.dest_distance_meters,
            avg_rating=candidate.avg_rating,
            review_count=candidate.review_count,
        )
        scored.append(match)

    scored.sort(key=ranking_sort_key)
    return scored[:max_results]

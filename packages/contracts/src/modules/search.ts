import { z } from "zod";
import { GeoPointSchema } from "./geo.js";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

// ─── Canonical Exclusion & Eligibility Codes (AD-11) ──────────────────────────

export const ExclusionCodeSchema = z.enum([
  "DRIVER_STATUS",
  "INVALID_GEOMETRY",
  "DISTANCE",
  "DIRECTION",
  "OPERATING_DAY",
  "CAPACITY",
  "TIMING",
]);
export type ExclusionCode = z.infer<typeof ExclusionCodeSchema>;

export const FirstFailureCountsSchema = z
  .object({
    driverStatus: z.number().int().nonnegative().default(0),
    invalidGeometry: z.number().int().nonnegative().default(0),
    distance: z.number().int().nonnegative().default(0),
    direction: z.number().int().nonnegative().default(0),
    operatingDay: z.number().int().nonnegative().default(0),
    capacity: z.number().int().nonnegative().default(0),
    timing: z.number().int().nonnegative().default(0),
  })
  .strict();
export type FirstFailureCounts = z.infer<typeof FirstFailureCountsSchema>;

export const ExclusionSummarySchema = z
  .object({
    firstFailureCounts: FirstFailureCountsSchema,
  })
  .strict();
export type ExclusionSummary = z.infer<typeof ExclusionSummarySchema>;

export const NoMatchReasonSchema = z.enum([
  "NO_DRIVERS_IN_AREA",
  "NO_DRIVERS_IN_DIRECTION",
  "NO_DRIVERS_ON_DAY",
  "ALL_DRIVERS_FULL",
  "NO_DRIVERS_AT_TIME",
]);
export type NoMatchReason = z.infer<typeof NoMatchReasonSchema>;

// ─── Score Breakdown Schema (T1.06) ───────────────────────────────────────────

export const ScoreBreakdownSchema = z
  .object({
    proximityScore: z.number().min(0).max(1),
    timingScore: z.number().min(0).max(1),
    ratingScore: z.number().min(0).max(1),
    capacityScore: z.number().min(0).max(1),
    acceptanceScore: z.number().min(0).max(1),
  })
  .strict();
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

// ─── Internal API Schemas (POST /internal/v1/matching/search, AD-5) ───────────

export const InternalSearchRequestSchema = z
  .object({
    riderId: z.string().uuid(),
    pickupLat: z.number().min(-90).max(90),
    pickupLng: z.number().min(-180).max(180),
    destLat: z.number().min(-90).max(90),
    destLng: z.number().min(-180).max(180),
    day: z.number().int().min(0).max(6),
    departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    subscriptionType: z.enum(["ONE_WAY", "ROUND_TRIP"]),
    pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    pickupRadiusMeters: z.number().positive().max(10000).default(1500),
    destRadiusMeters: z.number().positive().max(10000).default(2000),
  })
  .strict()
  .refine(
    (data) => {
      if (data.subscriptionType === "ROUND_TRIP") {
        return Boolean(data.pickupTime);
      }
      return data.pickupTime === undefined;
    },
    {
      message:
        "pickupTime is required for ROUND_TRIP and must not be provided for ONE_WAY",
      path: ["pickupTime"],
    },
  );
export type InternalSearchRequest = z.infer<typeof InternalSearchRequestSchema>;

export const InternalCandidateMatchSchema = z
  .object({
    driverProfileId: z.string().uuid(),
    compositeScore: z.number().min(0).max(1),
    scoreBreakdown: ScoreBreakdownSchema,
    pickupDistanceMeters: z.number().nonnegative(),
    destDistanceMeters: z.number().nonnegative(),
    estimatedTripDurationMinutes: z.number().nonnegative(),
    availableSeats: z.number().int().nonnegative(),
    avgRating: z.number().min(1).max(5).nullable(),
    reviewCount: z.number().int().nonnegative(),
  })
  .strict();
export type InternalCandidateMatch = z.infer<typeof InternalCandidateMatchSchema>;

export const InternalSearchResponseSchema = z
  .object({
    results: z.array(InternalCandidateMatchSchema),
    totalCandidatesEvaluated: z.number().int().nonnegative(),
    totalEligible: z.number().int().nonnegative(),
    exclusionSummary: ExclusionSummarySchema,
    meta: z
      .object({
        executionTimeMs: z.number().nonnegative(),
        searchTimestamp: z.string(),
      })
      .strict(),
  })
  .strict();
export type InternalSearchResponse = z.infer<typeof InternalSearchResponseSchema>;

// ─── Public Gateway Search API Schemas (GET /drivers/search, T1.08) ───────────

export const DriverSearchQuerySchema = z
  .object({
    riderId: z.string().uuid(),
    pickupLat: z.coerce.number().min(-90).max(90).optional(),
    pickupLng: z.coerce.number().min(-180).max(180).optional(),
    destLat: z.coerce.number().min(-90).max(90).optional(),
    destLng: z.coerce.number().min(-180).max(180).optional(),
    day: z.coerce.number().int().min(0).max(6),
    departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    subscriptionType: z.enum(["ONE_WAY", "ROUND_TRIP"]),
    pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  })
  .refine(
    (data) => {
      if (data.subscriptionType === "ROUND_TRIP") {
        return Boolean(data.pickupTime);
      }
      return data.pickupTime === undefined;
    },
    {
      message:
        "pickupTime is required for ROUND_TRIP and must not be provided for ONE_WAY",
      path: ["pickupTime"],
    },
  );
export type DriverSearchQuery = z.infer<typeof DriverSearchQuerySchema>;

export const SearchRoutesRequestSchema = z
  .object({
    pickupLocation: GeoPointSchema,
    dropoffLocation: GeoPointSchema,
    operatingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    timeWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timeWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    radiusMeters: z.number().positive().max(5000).default(500),
  })
  .strict();
export type SearchRoutesRequest = z.infer<typeof SearchRoutesRequestSchema>;

export const MatchedRouteResultSchema = z
  .object({
    driverProfileId: z.string().uuid(),
    driverName: z.string(),
    driverRating: z.number(),
    vehicleMake: z.string(),
    vehicleModel: z.string(),
    vehicleColour: z.string(),
    monthlyPriceCents: z.number().int(),
    currency: z.string(),
    pickupWalkDistanceMeters: z.number(),
    dropoffWalkDistanceMeters: z.number(),
    estimatedPickupTime: z.string(),
    estimatedDropoffTime: z.string(),
    availableSeats: z.number().int(),
    matchScore: z.number(),
  })
  .strict();
export type MatchedRouteResult = z.infer<typeof MatchedRouteResultSchema>;

export const DriverSearchResponseDataSchema = z
  .object({
    results: z.array(MatchedRouteResultSchema),
    count: z.number().int(),
    totalEligible: z.number().int().nonnegative(),
    searchRadiusMetres: z.number().positive(),
    noMatchReasons: z.array(NoMatchReasonSchema).optional(),
  })
  .strict();
export type DriverSearchResponseData = z.infer<typeof DriverSearchResponseDataSchema>;

export const DriverSearchResponseSchema = createSuccessEnvelopeSchema(
  DriverSearchResponseDataSchema,
);
export type DriverSearchResponse = z.infer<typeof DriverSearchResponseSchema>;

// Backward-compatible alias
export const SearchRoutesResponseSchema = DriverSearchResponseSchema;
export type SearchRoutesResponse = DriverSearchResponse;

import { z } from "zod";
import {
  CoordinatesSchema,
  GeoLineStringSchema,
  GeoPointSchema,
} from "./geo.js";
import { ScoreBreakdownSchema } from "./search.js";
import { SubTypeSchema } from "./subscriptions.js";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DaySchema = z.number().int().min(0).max(6);
export const RunLegTypeSchema = z.enum(["DEPARTURE", "PICKUP"]);
export const DriverRouteStateSchema = z.enum(["UNSET", "ESTABLISHED"]);

// Structural validation only; spatial validity and platform coverage bounds are
// checked authoritatively by PostGIS before settings are persisted.
const LinearRingSchema = z
  .array(CoordinatesSchema)
  .min(4)
  .max(100)
  .refine((ring) => {
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) return false;
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]!;
      const b = ring[i + 1]!;
      area += a[0] * b[1] - b[0] * a[1];
    }
    return area !== 0;
  }, "Polygon rings must be closed and have nonzero area");

export const GeoPolygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(LinearRingSchema).min(1).max(10),
  })
  .strict();

export const DriverLegAvailabilitySchema = z
  .object({
    day: DaySchema,
    startTime: TimeSchema,
    endTime: TimeSchema,
  })
  .strict()
  .refine((value) => value.startTime < value.endTime, {
    message: "Availability must end after it starts on the same day",
    path: ["endTime"],
  });

export const DriverServiceAreaSettingsSchema = z
  .object({
    serviceArea: GeoPolygonSchema,
    startingLocation: GeoPointSchema,
    availability: z.array(DriverLegAvailabilitySchema).min(1).max(56),
    acceptingRequests: z.boolean(),
    routeState: DriverRouteStateSchema,
    routePolyline: GeoLineStringSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.routeState === "UNSET") !== (value.routePolyline === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["routePolyline"],
        message: "Route state must agree with route geometry",
      });
    }
    for (let i = 0; i < value.availability.length; i++) {
      const a = value.availability[i]!;
      for (const b of value.availability.slice(i + 1)) {
        if (
          a.day === b.day &&
          a.startTime < b.endTime &&
          b.startTime < a.endTime
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["availability"],
            message: "Availability windows on the same day must not overlap",
          });
        }
      }
    }
  });

export const DriverServiceAreaResponseDataSchema = z
  .object({
    settings: DriverServiceAreaSettingsSchema.nullable(),
    availabilityVersion: z.number().int().nonnegative(),
    rosterVersion: z.number().int().nonnegative(),
    requiresSetup: z.boolean(),
  })
  .strict();

const CommuteShape = {
  riderId: z.string().uuid(),
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
  destLat: z.number().min(-90).max(90),
  destLng: z.number().min(-180).max(180),
  day: DaySchema,
  departureTime: TimeSchema,
  subscriptionType: SubTypeSchema,
  pickupTime: TimeSchema.optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
};
function validReturnTime(value: {
  subscriptionType: string;
  departureTime: string;
  pickupTime?: string | undefined;
}): boolean {
  return value.subscriptionType === "ROUND_TRIP"
    ? value.pickupTime !== undefined && value.pickupTime > value.departureTime
    : value.pickupTime === undefined;
}
const ReturnTimeError = {
  message: "Only ROUND_TRIP requires a later pickupTime",
  path: ["pickupTime"],
};
export const InternalDiscoveryRequestV2Schema = z
  .object(CommuteShape)
  .strict()
  .refine(validReturnTime, ReturnTimeError);
export const DriverDiscoveryQueryV2Schema = z
  .object({
    ...CommuteShape,
    pickupLat: z.coerce.number().min(-90).max(90).optional(),
    pickupLng: z.coerce.number().min(-180).max(180).optional(),
    destLat: z.coerce.number().min(-90).max(90).optional(),
    destLng: z.coerce.number().min(-180).max(180).optional(),
    day: z.coerce.number().int().min(0).max(6),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    (value) =>
      (value.pickupLat === undefined) === (value.pickupLng === undefined) &&
      (value.destLat === undefined) === (value.destLng === undefined),
    { message: "Location overrides require both latitude and longitude" },
  )
  .refine(validReturnTime, ReturnTimeError);

const CandidateShape = {
  driverProfileId: z.string().uuid(),
  routeState: DriverRouteStateSchema,
  pickupDistanceMeters: z.number().nonnegative().nullable(),
  destDistanceMeters: z.number().nonnegative().nullable(),
  availableSeats: z.number().int().positive(),
  availabilityStatus: z.literal("AVAILABLE"),
  reviewStatus: z.enum(["REQUIRED", "NOT_REQUIRED"]),
  avgRating: z.number().min(1).max(5).nullable(),
  reviewCount: z.number().int().nonnegative(),
};
function validRouteDistances(value: {
  routeState: string;
  pickupDistanceMeters: number | null;
  destDistanceMeters: number | null;
}): boolean {
  return value.routeState === "UNSET"
    ? value.pickupDistanceMeters === null && value.destDistanceMeters === null
    : value.pickupDistanceMeters !== null && value.destDistanceMeters !== null;
}
const DistanceError = {
  message: "Route distances must be null only for UNSET routes",
  path: ["pickupDistanceMeters"],
};
export const InternalDiscoveryCandidateV2Schema = z
  .object({
    ...CandidateShape,
    compositeScore: z.number().min(0).max(1),
    scoreBreakdown: ScoreBreakdownSchema,
  })
  .strict()
  .refine(validRouteDistances, DistanceError);
export const DiscoveryPaginationV2Schema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  })
  .strict()
  .refine(
    (value) => value.hasMore === value.page * value.pageSize < value.total,
    { message: "hasMore must agree with page and total" },
  );
export const InternalDiscoveryResponseV2Schema = z
  .object({
    version: z.literal("v2"),
    results: z.array(InternalDiscoveryCandidateV2Schema),
    pagination: DiscoveryPaginationV2Schema,
    policyVersion: z.string().min(1),
  })
  .strict();
export const DriverDiscoveryResultV2Schema = z
  .object({
    ...CandidateShape,
    driverName: z.string(),
    vehicleMake: z.string(),
    vehicleModel: z.string(),
    vehicleColour: z.string(),
    monthlyPriceCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
  })
  .strict()
  .refine(validRouteDistances, DistanceError);
export const DriverDiscoveryResponseDataV2Schema = z
  .object({
    version: z.literal("v2"),
    results: z.array(DriverDiscoveryResultV2Schema),
    pagination: DiscoveryPaginationV2Schema,
  })
  .strict();
export const DriverDiscoveryResponseV2Schema = createSuccessEnvelopeSchema(
  DriverDiscoveryResponseDataV2Schema,
);

export const RequestedLegV2Schema = z
  .object({
    legType: RunLegTypeSchema,
    pickupLocation: GeoPointSchema,
    dropoffLocation: GeoPointSchema,
    pickupWindowStart: TimeSchema,
    pickupWindowEnd: TimeSchema,
    arrivalDeadline: TimeSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.pickupWindowStart <= value.pickupWindowEnd &&
      value.pickupWindowEnd < value.arrivalDeadline,
    {
      message:
        "Pickup window and arrival deadline must be ordered within one day",
    },
  );
export const RequestSubscriptionV2Schema = z
  .object({
    riderId: z.string().uuid(),
    driverProfileId: z.string().uuid(),
    type: SubTypeSchema,
    operatingDays: z
      .array(DaySchema)
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length),
    legs: z.array(RequestedLegV2Schema).min(1).max(2),
    startDate: z.iso.date(),
  })
  .strict()
  .refine(
    (value) => {
      const legs = value.legs.map((leg) => leg.legType);
      if (value.type !== "ROUND_TRIP")
        return value.type === "ONE_WAY" && legs.length === 1 && legs[0] === "DEPARTURE";
      const departure = value.legs.find((leg) => leg.legType === "DEPARTURE");
      const pickup = value.legs.find((leg) => leg.legType === "PICKUP");
      return (
        departure !== undefined &&
        pickup !== undefined &&
        departure.arrivalDeadline < pickup.pickupWindowStart
      );
    },
    {
      message:
        "Requested legs must match subscription type and round-trip order",
      path: ["legs"],
    },
  );

export const PendingSubscriptionDataSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal("PENDING"),
    requestedTerms: RequestSubscriptionV2Schema,
    monthlyPriceCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    responseDeadline: z.string().datetime(),
    createdAt: z.string().datetime(),
    reviewStatus: z.literal("REQUIRED"),
  })
  .strict();
export const PendingSubscriptionResponseSchema = createSuccessEnvelopeSchema(
  PendingSubscriptionDataSchema,
);
export type PendingSubscriptionData = z.infer<
  typeof PendingSubscriptionDataSchema
>;

export const FeasibilityProposalV2Schema = z
  .object({
    version: z.literal("v2"),
    requestId: z.string().uuid(),
    driverProfileId: z.string().uuid(),
    rosterVersion: z.number().int().nonnegative(),
    availabilityVersion: z.number().int().nonnegative(),
    policyVersion: z.string().min(1),
    estimateVersion: z.string().min(1),
    estimatedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    status: z.enum(["FEASIBLE", "INFEASIBLE", "UNKNOWN"]),
    reason: z
      .enum([
        "CAPACITY",
        "TIMING",
        "COVERAGE",
        "AVAILABILITY",
        "STALE_ESTIMATE",
        "MISSING_ESTIMATE",
        "NO_VALID_INSERTION",
      ])
      .nullable(),
    assignments: z.array(
      z
        .object({
          day: DaySchema,
          legType: RunLegTypeSchema,
          runId: z.string().uuid().nullable(),
          orderedStopIds: z
            .array(z.string().uuid())
            .min(2)
            .refine((ids) => new Set(ids).size === ids.length),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(
    (value) =>
      value.expiresAt > value.estimatedAt &&
      (value.status === "FEASIBLE"
        ? value.reason === null && value.assignments.length > 0
        : value.reason !== null && value.assignments.length === 0),
    {
      message: "Proposal status, evidence lifetime and assignments must agree",
    },
  );

export type GeoPolygon = z.infer<typeof GeoPolygonSchema>;
export type DriverRouteState = z.infer<typeof DriverRouteStateSchema>;
export type RunLegType = z.infer<typeof RunLegTypeSchema>;
export type DriverLegAvailability = z.infer<typeof DriverLegAvailabilitySchema>;
export type DriverServiceAreaSettings = z.infer<
  typeof DriverServiceAreaSettingsSchema
>;
export type DriverServiceAreaResponseData = z.infer<
  typeof DriverServiceAreaResponseDataSchema
>;
export type InternalDiscoveryRequestV2 = z.infer<
  typeof InternalDiscoveryRequestV2Schema
>;
export type DriverDiscoveryQueryV2 = z.infer<
  typeof DriverDiscoveryQueryV2Schema
>;
export type InternalDiscoveryCandidateV2 = z.infer<
  typeof InternalDiscoveryCandidateV2Schema
>;
export type DiscoveryPaginationV2 = z.infer<typeof DiscoveryPaginationV2Schema>;
export type InternalDiscoveryResponseV2 = z.infer<
  typeof InternalDiscoveryResponseV2Schema
>;
export type DriverDiscoveryResultV2 = z.infer<
  typeof DriverDiscoveryResultV2Schema
>;
export type DriverDiscoveryResponseDataV2 = z.infer<
  typeof DriverDiscoveryResponseDataV2Schema
>;
export type DriverDiscoveryResponseV2 = z.infer<
  typeof DriverDiscoveryResponseV2Schema
>;
export type RequestedLegV2 = z.infer<typeof RequestedLegV2Schema>;
export type RequestSubscriptionV2 = z.infer<typeof RequestSubscriptionV2Schema>;
export type FeasibilityProposalV2 = z.infer<typeof FeasibilityProposalV2Schema>;

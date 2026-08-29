import { z } from "zod";
import { GeoPointSchema } from "./geo.js";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

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

export const SearchRoutesResponseSchema = createSuccessEnvelopeSchema(
  z
    .object({
      results: z.array(MatchedRouteResultSchema),
      count: z.number().int(),
    })
    .strict(),
);

export type SearchRoutesRequest = z.infer<typeof SearchRoutesRequestSchema>;
export type MatchedRouteResult = z.infer<typeof MatchedRouteResultSchema>;

import { z } from "zod";
import { GeoLineStringSchema } from "./geo.js";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

export const DriverStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "SUSPENDED",
  "REJECTED",
]);
export const VerifyTierSchema = z.enum(["BASIC", "ENHANCED", "ELITE"]);

export const AcceptedDocTypeSchema = z.enum([
  "CNIC",
  "LICENCE",
  "REGISTRATION",
  "INSURANCE",
]);
export type AcceptedDocType = z.infer<typeof AcceptedDocTypeSchema>;

export const DriverDocumentItemSchema = z
  .object({
    id: z.string().uuid(),
    driverId: z.string().uuid(),
    docType: AcceptedDocTypeSchema,
    s3Key: z.string(),
    expiryDate: z.string().nullable(),
    verifiedAt: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type DriverDocumentItem = z.infer<typeof DriverDocumentItemSchema>;

export const DriverDocumentListResponseSchema = createSuccessEnvelopeSchema(
  z.array(DriverDocumentItemSchema),
);

export const DriverOnboardingStageSchema = z.enum([
  "step1-vehicle",
  "step2-documents",
  "step4-availability",
  "pending",
  "approved",
  "rejected",
  "suspended",
]);
export type DriverOnboardingStage = z.infer<typeof DriverOnboardingStageSchema>;

export const DriverOnboardingStatusSchema = z
  .object({
    currentStep: DriverOnboardingStageSchema,
    status: DriverStatusSchema.nullable(),
    profileCompleted: z.boolean(),
    documentsCompleted: z.boolean(),
    availabilityCompleted: z.boolean(),
    uploadedDocuments: z.array(AcceptedDocTypeSchema),
    missingDocuments: z.array(AcceptedDocTypeSchema),
  })
  .strict();
export type DriverOnboardingStatus = z.infer<
  typeof DriverOnboardingStatusSchema
>;

export const DriverOnboardingStatusResponseSchema = createSuccessEnvelopeSchema(
  DriverOnboardingStatusSchema,
);

export const OnboardDriverRequestSchema = z
  .object({
    licenceNumber: z.string().min(3).max(50),
    vehicleMake: z.string().min(1).max(50),
    vehicleModel: z.string().min(1).max(50),
    vehicleYear: z
      .number()
      .int()
      .min(1990)
      .max(new Date().getFullYear() + 1),
    vehicleColour: z.string().min(1).max(30),
    plateNumber: z.string().min(2).max(20),
    seatCapacity: z.number().int().min(1).max(50),
    routePolyline: GeoLineStringSchema.optional(),
    operatingDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, {
        message: "operatingDays must not contain duplicate values",
      })
      .optional(),
    basePriceCents: z.number().int().positive().optional(),
    currency: z.string().length(3).default("PKR"),
  })
  .strict();

export const DriverProfileSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    licenceNumber: z.string(),
    vehicleMake: z.string(),
    vehicleModel: z.string(),
    vehicleYear: z.number(),
    vehicleColour: z.string(),
    plateNumber: z.string(),
    seatCapacity: z.number(),
    routePolyline: GeoLineStringSchema.optional(),
    operatingDays: z.array(z.number()),
    basePriceCents: z.number(),
    currency: z.string(),
    status: DriverStatusSchema,
    verificationTier: VerifyTierSchema,
    acceptanceRate: z.number().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const UpdateDriverAvailabilitySchema = z
  .object({
    operatingDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, {
        message: "operatingDays must not contain duplicate values",
      })
      .optional(),
    basePriceCents: z.number().int().positive().optional(),
  })
  .strict();

export const UpdateDriverRouteSchema = z
  .object({
    routePolyline: GeoLineStringSchema,
  })
  .strict();

// ─── Location-Search Route Schemas ──────────────────────────────────────────

/**
 * A single resolved location returned by the Google Places proxy.
 * The mobile client resolves place_id → coordinates before sending.
 */
export const RouteLocationSchema = z
  .object({
    address: z.string().min(1).max(500),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();

/**
 * Request body for POST /drivers/me/route/from-locations.
 * The driver provides an ordered list of at least 2 locations;
 * the backend constructs a multi-point GeoJSON LineString.
 */
export const SetDriverRouteFromLocationsSchema = z
  .object({
    locations: z
      .array(RouteLocationSchema)
      .min(2, "At least 2 locations are required to define a route")
      .max(20, "A maximum of 20 locations is allowed"),
  })
  .strict();

export const DriverProfileResponseSchema =
  createSuccessEnvelopeSchema(DriverProfileSchema);

export type OnboardDriverRequest = z.infer<typeof OnboardDriverRequestSchema>;
export type DriverProfile = z.infer<typeof DriverProfileSchema>;
export type UpdateDriverAvailability = z.infer<
  typeof UpdateDriverAvailabilitySchema
>;
export type UpdateDriverRoute = z.infer<typeof UpdateDriverRouteSchema>;
export type RouteLocation = z.infer<typeof RouteLocationSchema>;
export type SetDriverRouteFromLocations = z.infer<
  typeof SetDriverRouteFromLocationsSchema
>;

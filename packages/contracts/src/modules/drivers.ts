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
    routePolyline: GeoLineStringSchema,
    operatingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    basePriceCents: z.number().int().positive(),
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
      .optional(),
    basePriceCents: z.number().int().positive().optional(),
  })
  .strict();

export const UpdateDriverRouteSchema = z
  .object({
    routePolyline: GeoLineStringSchema,
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

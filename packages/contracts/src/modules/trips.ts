import { z } from "zod";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

export const TripTypeSchema = z.enum(["MORNING", "AFTERNOON"]);
export const TripStatusSchema = z.enum([
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "MISSED",
  "CANCELLED",
]);

export const TripSchema = z
  .object({
    id: z.string().uuid(),
    subscriptionId: z.string().uuid(),
    driverProfileId: z.string().uuid(),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: TripTypeSchema,
    status: TripStatusSchema,
    actualPickupAt: z.string().datetime().nullable().optional(),
    actualDropoffAt: z.string().datetime().nullable().optional(),
    deviationAlertSent: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const UpdateTripStatusRequestSchema = z
  .object({
    status: z.enum(["IN_PROGRESS", "COMPLETED", "MISSED", "CANCELLED"]),
    timestamp: z.string().datetime().optional(),
  })
  .strict();

export const MarkPickupRequestSchema = z
  .object({
    pickupTimestamp: z.string().datetime(),
  })
  .strict();

export const MarkDropoffRequestSchema = z
  .object({
    dropoffTimestamp: z.string().datetime(),
  })
  .strict();

export const TripResponseSchema = createSuccessEnvelopeSchema(TripSchema);
export const TripListResponseSchema = createSuccessEnvelopeSchema(
  z.array(TripSchema),
);

export type Trip = z.infer<typeof TripSchema>;
export type UpdateTripStatusRequest = z.infer<
  typeof UpdateTripStatusRequestSchema
>;
export type MarkPickupRequest = z.infer<typeof MarkPickupRequestSchema>;
export type MarkDropoffRequest = z.infer<typeof MarkDropoffRequestSchema>;

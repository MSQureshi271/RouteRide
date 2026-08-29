import { z } from "zod";
import { GeoPointSchema } from "./geo.js";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

export const SubTypeSchema = z.enum(["MORNING", "AFTERNOON", "ROUND_TRIP"]);
export const SubStatusSchema = z.enum([
  "PENDING",
  "ACTIVE",
  "PAUSED",
  "CANCELLED",
  "EXPIRED",
]);

export const RequestSubscriptionRequestSchema = z
  .object({
    riderId: z.string().uuid(),
    driverProfileId: z.string().uuid(),
    type: SubTypeSchema,
    agreedPickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    agreedDropoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    agreedPickupLocation: GeoPointSchema,
    agreedDropoffLocation: GeoPointSchema,
    pickupAddressText: z.string(),
    dropoffAddressText: z.string(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const SubscriptionSchema = z
  .object({
    id: z.string().uuid(),
    riderId: z.string().uuid(),
    driverProfileId: z.string().uuid(),
    type: SubTypeSchema,
    agreedPickupTime: z.string(),
    agreedDropoffTime: z.string(),
    pickupAddressText: z.string(),
    dropoffAddressText: z.string(),
    monthlyPriceCents: z.number().int(),
    currency: z.string(),
    status: SubStatusSchema,
    startDate: z.string(),
    nextBillingDate: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const CancelSubscriptionRequestSchema = z
  .object({
    cancellationReason: z.string().min(5).max(500),
  })
  .strict();

export const SubscriptionResponseSchema =
  createSuccessEnvelopeSchema(SubscriptionSchema);
export const SubscriptionListResponseSchema = createSuccessEnvelopeSchema(
  z.array(SubscriptionSchema),
);

export type RequestSubscriptionRequest = z.infer<
  typeof RequestSubscriptionRequestSchema
>;
export type CancelSubscriptionRequest = z.infer<
  typeof CancelSubscriptionRequestSchema
>;
export type Subscription = z.infer<typeof SubscriptionSchema>;

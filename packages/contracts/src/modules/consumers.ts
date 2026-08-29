import { z } from "zod";
import { GeoPointSchema } from "./geo.js";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

export const CreateRiderRequestSchema = z
  .object({
    name: z.string().min(2).max(100),
    homeAddressText: z.string().min(5).max(255),
    homeLocation: GeoPointSchema,
    destAddressText: z.string().min(5).max(255),
    destLocation: GeoPointSchema,
    notes: z.string().max(500).optional(),
  })
  .strict();

export const UpdateRiderRequestSchema = CreateRiderRequestSchema.partial();

export const RiderSchema = z
  .object({
    id: z.string().uuid(),
    consumerProfileId: z.string().uuid(),
    name: z.string(),
    photoUrl: z.string().nullable().optional(),
    homeAddressText: z.string(),
    homeLocation: GeoPointSchema.optional(),
    destAddressText: z.string(),
    destLocation: GeoPointSchema.optional(),
    notes: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ConsumerProfileSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    emergencyContactName: z.string(),
    emergencyContactPhone: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const UpdateConsumerProfileSchema = z
  .object({
    emergencyContactName: z.string().min(2).max(100).optional(),
    emergencyContactPhone: z
      .string()
      .regex(/^\+[1-9]\d{1,14}$/)
      .optional(),
  })
  .strict();

export const RiderResponseSchema = createSuccessEnvelopeSchema(RiderSchema);
export const RiderListResponseSchema = createSuccessEnvelopeSchema(
  z.array(RiderSchema),
);
export const ConsumerProfileResponseSchema = createSuccessEnvelopeSchema(
  ConsumerProfileSchema,
);

export type CreateRiderRequest = z.infer<typeof CreateRiderRequestSchema>;
export type UpdateRiderRequest = z.infer<typeof UpdateRiderRequestSchema>;
export type Rider = z.infer<typeof RiderSchema>;
export type ConsumerProfile = z.infer<typeof ConsumerProfileSchema>;
export type UpdateConsumerProfile = z.infer<typeof UpdateConsumerProfileSchema>;

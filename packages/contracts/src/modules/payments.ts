import { z } from "zod";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

export const PayStatusSchema = z.enum([
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
]);
export const PayoutStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
]);

export const PaymentMethodSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    gateway: z.string(),
    gatewayPaymentMethodId: z.string(),
    isDefault: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const PaymentSchema = z
  .object({
    id: z.string().uuid(),
    subscriptionId: z.string().uuid(),
    amountCents: z.number().int().positive(),
    currency: z.string().length(3),
    status: PayStatusSchema,
    stripePaymentIntentId: z.string().nullable().optional(),
    idempotencyKey: z.string(),
    billingDate: z.string(),
    receiptUrl: z.string().nullable().optional(),
    failureReason: z.string().nullable().optional(),
    retryCount: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const DriverPayoutSchema = z
  .object({
    id: z.string().uuid(),
    driverProfileId: z.string().uuid(),
    periodStart: z.string(),
    periodEnd: z.string(),
    grossCents: z.number().int(),
    commissionCents: z.number().int(),
    netCents: z.number().int(),
    status: PayoutStatusSchema,
    payoutDate: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const PaymentResponseSchema = createSuccessEnvelopeSchema(PaymentSchema);
export const PaymentListResponseSchema = createSuccessEnvelopeSchema(
  z.array(PaymentSchema),
);
export const DriverPayoutListResponseSchema = createSuccessEnvelopeSchema(
  z.array(DriverPayoutSchema),
);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type DriverPayout = z.infer<typeof DriverPayoutSchema>;

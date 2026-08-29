import { z } from "zod";
import { ErrorCodeSchema } from "./errors.js";

export const MetaSchema = z
  .object({
    requestId: z.string(),
    timestamp: z.string().datetime(),
  })
  .strict();

export const ErrorMetaSchema = z
  .object({
    requestId: z.string(),
  })
  .strict();

export const ErrorDetailSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  })
  .strict();

export const ErrorEnvelopeSchema = z
  .object({
    error: ErrorDetailSchema,
    meta: ErrorMetaSchema,
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export function createSuccessEnvelopeSchema<T extends z.ZodTypeAny>(
  dataSchema: T,
) {
  return z
    .object({
      data: dataSchema,
      meta: MetaSchema,
    })
    .strict();
}

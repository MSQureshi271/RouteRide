import { z } from "zod";
import { DriverDiscoveryResultV2Schema } from "./service-area.js";
import { VerifyTierSchema } from "./drivers.js";

/** Public allowlist: never include roster, route geometry or starting location. */
export const DriverPublicProfileSchema = z
  .object({
    driver: DriverDiscoveryResultV2Schema,
    photoUrl: z.string().url().nullable(),
    vehicleYear: z.number().int(),
    plateNumber: z.string(),
    verificationTier: VerifyTierSchema,
    ratingDistribution: z
      .array(
        z
          .object({
            rating: z.number().int().min(1).max(5),
            count: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .length(5),
    reviews: z.array(
      z
        .object({
          rating: z.number().int().min(1).max(5),
          comment: z.string().nullable(),
          createdAt: z.string().datetime(),
          verified: z.literal(true),
        })
        .strict(),
    ),
    reviewsPagination: z
      .object({
        page: z.number().int().positive(),
        pageSize: z.literal(10),
        total: z.number().int().nonnegative(),
        hasMore: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type DriverPublicProfile = z.infer<typeof DriverPublicProfileSchema>;

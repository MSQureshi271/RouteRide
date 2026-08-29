import { z } from "zod";
import { CoordinatesSchema } from "./geo.js";

export const DriverLocationEventSchema = z
  .object({
    event: z.literal("driver:location"),
    driverProfileId: z.string().uuid(),
    tripId: z.string().uuid().optional(),
    coordinates: CoordinatesSchema,
    speedMps: z.number().optional(),
    headingDegrees: z.number().min(0).max(360).optional(),
    timestamp: z.string().datetime(),
  })
  .strict();

export const TripStatusEventSchema = z
  .object({
    event: z.literal("trip:status"),
    tripId: z.string().uuid(),
    status: z.enum([
      "SCHEDULED",
      "IN_PROGRESS",
      "COMPLETED",
      "MISSED",
      "CANCELLED",
    ]),
    timestamp: z.string().datetime(),
  })
  .strict();

export const TripDeviationEventSchema = z
  .object({
    event: z.literal("trip:deviation"),
    tripId: z.string().uuid(),
    driverProfileId: z.string().uuid(),
    deviationMeters: z.number(),
    timestamp: z.string().datetime(),
  })
  .strict();

export type DriverLocationEvent = z.infer<typeof DriverLocationEventSchema>;
export type TripStatusEvent = z.infer<typeof TripStatusEventSchema>;
export type TripDeviationEvent = z.infer<typeof TripDeviationEventSchema>;

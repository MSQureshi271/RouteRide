import { z } from "zod";

export const CoordinatesSchema = z.tuple([
  z.number().min(-180).max(180), // longitude
  z.number().min(-90).max(90), // latitude
]);

export const GeoPointSchema = z
  .object({
    type: z.literal("Point"),
    coordinates: CoordinatesSchema,
  })
  .strict();

export const GeoLineStringSchema = z
  .object({
    type: z.literal("LineString"),
    coordinates: z.array(CoordinatesSchema).min(2),
  })
  .strict();

export type GeoPoint = z.infer<typeof GeoPointSchema>;
export type GeoLineString = z.infer<typeof GeoLineStringSchema>;

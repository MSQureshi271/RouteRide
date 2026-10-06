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
  .strict()
  .refine(
    (line) => {
      // Reject zero-length lines: all coordinate pairs must not be identical
      const first = line.coordinates[0];
      return !line.coordinates.every(
        (c) => c[0] === first![0] && c[1] === first![1],
      );
    },
    {
      message:
        "LineString must not be a zero-length line (all identical points)",
    },
  );

export type GeoPoint = z.infer<typeof GeoPointSchema>;
export type GeoLineString = z.infer<typeof GeoLineStringSchema>;

// ─── Built-in Locations (for Testing & Quick Selection) ───────────────────────

export interface BuiltinLocation {
  id: string;
  name: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
}

export const BUILTIN_LOCATIONS: readonly BuiltinLocation[] = [
  {
    id: "loc-dha-phase-5",
    name: "DHA Phase 5",
    area: "DHA",
    address: "DHA Phase 5, Karachi",
    lat: 24.8055,
    lng: 67.0673,
  },
  {
    id: "loc-clifton-bath-island",
    name: "Bath Island, Clifton",
    area: "Clifton",
    address: "Bath Island, Clifton, Karachi",
    lat: 24.8322,
    lng: 67.0289,
  },
  {
    id: "loc-kgs-clifton",
    name: "Karachi Grammar School (Clifton)",
    area: "Clifton",
    address: "Karachi Grammar School, Clifton, Karachi",
    lat: 24.8285,
    lng: 67.0345,
  },
  {
    id: "loc-pechs-block-6",
    name: "PECHS Block 6",
    area: "PECHS",
    address: "PECHS Block 6, Shahrah-e-Faisal, Karachi",
    lat: 24.8615,
    lng: 67.0724,
  },
  {
    id: "loc-gulshan-block-13",
    name: "Gulshan-e-Iqbal Block 13",
    area: "Gulshan",
    address: "Gulshan-e-Iqbal Block 13, Karachi",
    lat: 24.918,
    lng: 67.0971,
  },
  {
    id: "loc-habib-university",
    name: "Habib University",
    area: "Gulistan-e-Jauhar",
    address: "Habib University, Block 18, Gulistan-e-Jauhar, Karachi",
    lat: 24.9056,
    lng: 67.1383,
  },
  {
    id: "loc-north-nazimabad-h",
    name: "North Nazimabad Block H",
    area: "North Nazimabad",
    address: "North Nazimabad Block H, Karachi",
    lat: 24.9388,
    lng: 67.0422,
  },
  {
    id: "loc-ii-chundrigar",
    name: "I.I. Chundrigar Road",
    area: "City Center",
    address: "I.I. Chundrigar Road, Karachi",
    lat: 24.851,
    lng: 67.008,
  },
  {
    id: "loc-saddar-empress",
    name: "Empress Market, Saddar",
    area: "Saddar",
    address: "Empress Market, Saddar, Karachi",
    lat: 24.858,
    lng: 67.0305,
  },
  {
    id: "loc-malir-cantt-1",
    name: "Malir Cantt (Gate 1)",
    area: "Malir",
    address: "Malir Cantt Gate 1, Karachi",
    lat: 24.9125,
    lng: 67.195,
  },
] as const;

/**
 * Deterministically resolves an address to a BuiltinLocation if and only if
 * the query explicitly matches a built-in location name, ID, or address.
 * Never performs fuzzy guessing on arbitrary addresses.
 */
export function findBuiltinLocation(
  query: string,
): BuiltinLocation | undefined {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return undefined;

  return BUILTIN_LOCATIONS.find((loc) => {
    const locId = loc.id.toLowerCase();
    const locName = loc.name.toLowerCase();
    const locAddr = loc.address.toLowerCase();

    return (
      locId === q ||
      locName === q ||
      locAddr === q ||
      locName.includes(q) ||
      q.includes(locName) ||
      q.includes(locId)
    );
  });
}

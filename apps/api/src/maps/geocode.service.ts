/**
 * GeocodeService — address-to-coordinates resolution (T0.42).
 *
 * Architecture:
 *  - MapsAdapter interface separates the transport from the business logic
 *  - GoogleMapsAdapter calls the Geocoding API and validates response shape
 *    before trusting any data (third-party data is untrusted per api-and-interface-design)
 *  - ConsoleMapsAdapter is the local/test stub that returns a fixed coordinate
 *    when GOOGLE_MAPS_API_KEY is absent (graceful degradation)
 *
 * Error contract:
 *  - Unresolvable address → throws UnprocessableEntityException (422) with
 *    error code NO_ROUTE_FOUND (matching contracts/errors.ts)
 *  - Adapter failure (network, non-200) → throws ServiceUnavailableException (503)
 *  - Malformed API response → throws ServiceUnavailableException (503) —
 *    never passes untrusted data through
 */
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { z } from "zod";
import { getEnv } from "@routeride/config";
import { findBuiltinLocation } from "@routeride/contracts";

// ─── MapsAdapter interface ────────────────────────────────────────────────────

export interface GeoCoords {
  lat: number;
  lng: number;
}

export abstract class MapsAdapter {
  abstract geocode(address: string): Promise<GeoCoords | null>;
}

// ─── Google Maps response schema (validate before use — third-party data) ─────

const GoogleGeocodeResultSchema = z.object({
  status: z.string(),
  results: z.array(
    z.object({
      geometry: z.object({
        location: z.object({
          lat: z.number(),
          lng: z.number(),
        }),
      }),
    }),
  ),
});

// ─── GoogleMapsAdapter ────────────────────────────────────────────────────────

@Injectable()
export class GoogleMapsAdapter extends MapsAdapter {
  private readonly logger = new Logger(GoogleMapsAdapter.name);

  async geocode(address: string): Promise<GeoCoords | null> {
    const env = getEnv();
    const apiKey = env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey === "REPLACE_ME") {
      this.logger.warn({
        event: "maps.api_key_missing",
        fallback: "console_adapter",
      });
      // Degrade gracefully in dev without a real API key
      return null;
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);

    let json: unknown;
    try {
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`Google Maps API returned HTTP ${response.status}`);
      }
      json = await response.json();
    } catch (err) {
      this.logger.error({
        event: "maps.geocode_fetch_error",
        error: String(err),
      });
      throw new ServiceUnavailableException(
        "Geocoding service is temporarily unavailable",
      );
    }

    // Validate the response shape before using any data from it
    const parsed = GoogleGeocodeResultSchema.safeParse(json);
    if (!parsed.success) {
      this.logger.error({
        event: "maps.geocode_invalid_response",
        issues: parsed.error.flatten(),
      });
      throw new ServiceUnavailableException(
        "Geocoding service returned an unexpected response",
      );
    }

    if (
      parsed.data.status === "ZERO_RESULTS" ||
      parsed.data.results.length === 0
    ) {
      return null;
    }

    if (parsed.data.status !== "OK") {
      this.logger.error({
        event: "maps.geocode_api_error",
        status: parsed.data.status,
      });
      throw new ServiceUnavailableException(
        "Geocoding service returned an error",
      );
    }

    const location = parsed.data.results[0]!.geometry.location;
    return { lat: location.lat, lng: location.lng };
  }
}

// ─── GeocodeService (business logic layer) ───────────────────────────────────

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);

  constructor(private readonly mapsAdapter: MapsAdapter) {}

  /**
   * Resolves a human-readable address to lat/lng.
   * Throws 422 NO_ROUTE_FOUND if the address cannot be resolved.
   * Throws 503 if the Maps adapter fails.
   */
  async geocodeAddress(address: string): Promise<GeoCoords> {
    // 1. Explicit match against predefined built-in locations
    const matchedBuiltin = findBuiltinLocation(address);
    if (matchedBuiltin) {
      this.logger.log({
        event: "maps.geocoded_builtin",
        locationId: matchedBuiltin.id,
        name: matchedBuiltin.name,
      });
      return { lat: matchedBuiltin.lat, lng: matchedBuiltin.lng };
    }

    // 2. Query Maps adapter (Google Maps) for arbitrary addresses
    let coords: GeoCoords | null = null;
    try {
      coords = await this.mapsAdapter.geocode(address);
    } catch (err: unknown) {
      this.logger.error({
        event: "maps.geocode_error",
        error: (err as Error).message,
      });
      throw new ServiceUnavailableException("Geocoding service unavailable");
    }

    if (!coords) {
      throw new UnprocessableEntityException({
        code: "NO_ROUTE_FOUND",
        message: `Address could not be resolved: "${address}"`,
      });
    }

    this.logger.log({
      event: "maps.geocoded",
      // Round to 2dp for logs (T0.16 coordinate redaction rule)
      lat: Math.round(coords.lat * 100) / 100,
      lng: Math.round(coords.lng * 100) / 100,
    });

    return coords;
  }
}

/**
 * MapsController — Google Places API proxy.
 *
 * Exposes two authenticated endpoints so the mobile client can use
 * Places autocomplete without embedding the API key in the app bundle.
 *
 * Routes (prefix: /maps — registered in MapsModule, imported in AppModule):
 *  - GET /maps/autocomplete?input=&sessionToken=
 *  - GET /maps/place-details?placeId=&sessionToken=
 *
 * Both endpoints require a valid JWT (DRIVER or CONSUMER role).
 * The Google Maps API key is read from server env — never sent to clients.
 *
 * Session token guidance:
 *  - The client generates a UUID per search session.
 *  - It passes the same token to every autocomplete call in that session.
 *  - On place selection it passes the token to place-details to close the
 *    session, triggering Google's per-session billing (cheaper).
 *  - After a successful place-details call the client MUST generate a new token.
 */
import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { getEnv } from "@routeride/config";
import { BUILTIN_LOCATIONS } from "@routeride/contracts";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";

// ─── Response types ────────────────────────────────────────────────────────────

export interface AutocompleteSuggestion {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  placeId: string;
  address: string;
  lat: number;
  lng: number;
}

// ─── Google API response validators (third-party data — validate before use) ──

const GoogleAutocompleteResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z.object({
          placeId: z.string(),
          text: z.object({ text: z.string() }),
        }),
      }),
    )
    .optional()
    .default([]),
});

const GooglePlaceDetailsResponseSchema = z.object({
  id: z.string(),
  formattedAddress: z.string().optional(),
  displayName: z.object({ text: z.string() }).optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
});

// ─── Karachi location bias (matches LAUNCH_CITY bbox from env) ────────────────
//
// We use a circle centred on Karachi to bias autocomplete results locally.
// Falls back to these hardcoded coords when env is not available during tests.
const KARACHI_CENTER = { latitude: 24.8607, longitude: 67.0104 };
const KARACHI_RADIUS_METERS = 40_000; // 40 km covers greater Karachi

// ─── Dev stub data (used when GOOGLE_MAPS_API_KEY is absent) ─────────────────

const DEV_PLACE_DETAILS_STUB: PlaceDetails = {
  placeId: "dev-place-stub",
  address: "Dev Stub Location, Karachi",
  lat: 24.8607,
  lng: 67.0099,
};

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller("maps")
@UseGuards(JwtAuthGuard)
export class MapsController {
  private readonly logger = new Logger(MapsController.name);

  /**
   * GET /maps/autocomplete?input=&sessionToken=
   *
   * Returns up to 5 place predictions biased to the Karachi area.
   * If the API key is absent (dev/test) returns stub suggestions.
   */
  @Get("autocomplete")
  async autocomplete(
    @Query("input") input: string | undefined,
    @Query("sessionToken") sessionToken: string | undefined,
  ): Promise<{ suggestions: AutocompleteSuggestion[] }> {
    if (!input || input.trim().length < 2) {
      return { suggestions: [] };
    }

    const env = getEnv();
    const apiKey = env.GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === "REPLACE_ME") {
      this.logger.warn({
        event: "maps.autocomplete.stub",
        reason: "GOOGLE_MAPS_API_KEY absent — returning dev stubs",
      });
      const q = input.toLowerCase();
      const filtered = BUILTIN_LOCATIONS.filter(
        (loc) =>
          loc.name.toLowerCase().includes(q) ||
          loc.area.toLowerCase().includes(q) ||
          loc.address.toLowerCase().includes(q),
      );
      const items = (filtered.length > 0 ? filtered : BUILTIN_LOCATIONS).slice(
        0,
        5,
      );
      return {
        suggestions: items.map((loc) => ({
          placeId: loc.id,
          description: `${loc.name}, Karachi (dev stub)`,
        })),
      };
    }

    const url = "https://places.googleapis.com/v1/places:autocomplete";

    let json: unknown;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
        },
        body: JSON.stringify({
          input: input.trim(),
          ...(sessionToken ? { sessionToken } : {}),
          locationBias: {
            circle: {
              center: KARACHI_CENTER,
              radius: KARACHI_RADIUS_METERS,
            },
          },
          // Limit to 5 results
          includedPrimaryTypes: [],
        }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        this.logger.error({
          event: "maps.autocomplete.api_error",
          status: response.status,
          body: errorText.slice(0, 200),
        });
        throw new ServiceUnavailableException(
          "Location autocomplete service is temporarily unavailable",
        );
      }

      json = await response.json();
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error({
        event: "maps.autocomplete.fetch_error",
        error: String(err),
      });
      throw new ServiceUnavailableException(
        "Location autocomplete service is temporarily unavailable",
      );
    }

    const parsed = GoogleAutocompleteResponseSchema.safeParse(json);
    if (!parsed.success) {
      this.logger.error({
        event: "maps.autocomplete.invalid_response",
        issues: parsed.error.flatten(),
      });
      throw new ServiceUnavailableException(
        "Location service returned an unexpected response",
      );
    }

    const suggestions = parsed.data.suggestions.slice(0, 5).map((s) => ({
      placeId: s.placePrediction.placeId,
      description: s.placePrediction.text.text,
    }));

    this.logger.log({
      event: "maps.autocomplete.success",
      count: suggestions.length,
    });

    return { suggestions };
  }

  /**
   * GET /maps/place-details?placeId=&sessionToken=
   *
   * Resolves a placeId to { lat, lng, address }.
   * If the API key is absent (dev/test) returns a stub response.
   */
  @Get("place-details")
  async placeDetails(
    @Query("placeId") placeId: string | undefined,
    @Query("sessionToken") sessionToken: string | undefined,
  ): Promise<PlaceDetails> {
    if (!placeId || placeId.trim().length === 0) {
      throw new BadRequestException("placeId query parameter is required");
    }

    const env = getEnv();
    const apiKey = env.GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === "REPLACE_ME") {
      this.logger.warn({
        event: "maps.place_details.stub",
        reason: "GOOGLE_MAPS_API_KEY absent — returning dev stub",
      });
      const matched = BUILTIN_LOCATIONS.find((loc) => loc.id === placeId);
      if (matched) {
        return {
          placeId: matched.id,
          address: matched.address,
          lat: matched.lat,
          lng: matched.lng,
        };
      }
      return { ...DEV_PLACE_DETAILS_STUB, placeId };
    }

    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

    let json: unknown;
    try {
      const headers: Record<string, string> = {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
      };
      // Attach session token to complete the billing session
      if (sessionToken) {
        headers["X-Goog-Session-Token"] = sessionToken;
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        this.logger.error({
          event: "maps.place_details.api_error",
          status: response.status,
          body: errorText.slice(0, 200),
        });
        throw new ServiceUnavailableException(
          "Location details service is temporarily unavailable",
        );
      }

      json = await response.json();
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error({
        event: "maps.place_details.fetch_error",
        error: String(err),
      });
      throw new ServiceUnavailableException(
        "Location details service is temporarily unavailable",
      );
    }

    const parsed = GooglePlaceDetailsResponseSchema.safeParse(json);
    if (!parsed.success) {
      this.logger.error({
        event: "maps.place_details.invalid_response",
        issues: parsed.error.flatten(),
      });
      throw new ServiceUnavailableException(
        "Location service returned an unexpected response",
      );
    }

    const data = parsed.data;
    const address =
      data.formattedAddress ?? data.displayName?.text ?? "Unknown location";

    this.logger.log({
      event: "maps.place_details.success",
      placeId: data.id,
      // Round coords for log redaction compliance
      lat: Math.round(data.location.latitude * 100) / 100,
      lng: Math.round(data.location.longitude * 100) / 100,
    });

    return {
      placeId: data.id,
      address,
      lat: data.location.latitude,
      lng: data.location.longitude,
    };
  }
}

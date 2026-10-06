/**
 * Integration tests for MapsController — Google Places API proxy.
 *
 * Verifies:
 *  - Autocomplete returns empty array for queries shorter than 2 chars.
 *  - Autocomplete returns dev stubs when GOOGLE_MAPS_API_KEY is absent.
 *  - Autocomplete calls Google Places API and returns formatted suggestions when key is present.
 *  - Autocomplete throws ServiceUnavailableException on upstream errors.
 *  - PlaceDetails throws BadRequestException when placeId is empty.
 *  - PlaceDetails returns dev stub when GOOGLE_MAPS_API_KEY is absent.
 *  - PlaceDetails calls Google Place Details API and returns parsed coordinates when key is present.
 *  - PlaceDetails passes session token in headers.
 */
let mockApiKey: string | undefined = undefined;

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    GOOGLE_MAPS_API_KEY: mockApiKey,
  }),
}));

jest.mock("@nestjs/passport", () => ({
  AuthGuard: () => class {},
}));

import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MapsController } from "../src/maps/maps.controller.js";

describe("MapsController — Places API Proxy", () => {
  let controller: MapsController;
  const originalFetch = global.fetch;

  beforeEach(() => {
    controller = new MapsController();
    mockApiKey = undefined;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe("GET /maps/autocomplete", () => {
    it("returns empty suggestions when input is missing or < 2 characters", async () => {
      const res1 = await controller.autocomplete(undefined, "session-123");
      expect(res1.suggestions).toEqual([]);

      const res2 = await controller.autocomplete(" ", "session-123");
      expect(res2.suggestions).toEqual([]);

      const res3 = await controller.autocomplete("a", "session-123");
      expect(res3.suggestions).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns dev stub suggestions when GOOGLE_MAPS_API_KEY is absent", async () => {
      mockApiKey = undefined;

      const res = await controller.autocomplete("Clifton", "session-123");
      expect(res.suggestions.length).toBeGreaterThan(0);
      expect(res.suggestions[0]?.description).toContain("dev stub");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("calls Google Places API and formats suggestions when API key is present", async () => {
      mockApiKey = "real-api-key";

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          suggestions: [
            {
              placePrediction: {
                placeId: "place-101",
                text: { text: "Clifton Block 2, Karachi" },
              },
            },
            {
              placePrediction: {
                placeId: "place-102",
                text: { text: "Clifton Beach, Karachi" },
              },
            },
          ],
        }),
      });

      const res = await controller.autocomplete("Clifton", "session-xyz");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://places.googleapis.com/v1/places:autocomplete",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Goog-Api-Key": "real-api-key",
            "Content-Type": "application/json",
          }),
        }),
      );

      expect(res.suggestions).toEqual([
        { placeId: "place-101", description: "Clifton Block 2, Karachi" },
        { placeId: "place-102", description: "Clifton Beach, Karachi" },
      ]);
    });

    it("throws ServiceUnavailableException when Google Places returns 500", async () => {
      mockApiKey = "real-api-key";

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        controller.autocomplete("Clifton", "session-xyz"),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe("GET /maps/place-details", () => {
    it("throws BadRequestException when placeId is empty or undefined", async () => {
      await expect(
        controller.placeDetails(undefined, "session-123"),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.placeDetails("   ", "session-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("returns dev stub when GOOGLE_MAPS_API_KEY is absent", async () => {
      mockApiKey = undefined;

      const res = await controller.placeDetails("dev-place-id", "session-123");
      expect(res.placeId).toBe("dev-place-id");
      expect(res.lat).toBeDefined();
      expect(res.lng).toBeDefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("calls Google Place Details API and parses coordinates when API key is present", async () => {
      mockApiKey = "real-api-key";

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "google-place-999",
          formattedAddress: "Clifton Beach Road, Karachi, Pakistan",
          location: {
            latitude: 24.815,
            longitude: 67.028,
          },
        }),
      });

      const res = await controller.placeDetails(
        "google-place-999",
        "session-token-abc",
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "https://places.googleapis.com/v1/places/google-place-999",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-Goog-Api-Key": "real-api-key",
            "X-Goog-Session-Token": "session-token-abc",
          }),
        }),
      );

      expect(res).toEqual({
        placeId: "google-place-999",
        address: "Clifton Beach Road, Karachi, Pakistan",
        lat: 24.815,
        lng: 67.028,
      });
    });

    it("throws ServiceUnavailableException when Google API fails", async () => {
      mockApiKey = "real-api-key";

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      });

      await expect(
        controller.placeDetails("place-id-err", "session-token-abc"),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});

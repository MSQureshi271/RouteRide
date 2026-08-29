import {
  RegisterRequestSchema,
  OnboardDriverRequestSchema,
  SearchRoutesRequestSchema,
  GeoPointSchema,
  GeoLineStringSchema,
  ErrorCodeSchema,
  ErrorEnvelopeSchema,
} from "./index.js";

describe("Contracts Schema Validation (TRD §5 DTOs)", () => {
  describe("Geo Schemas", () => {
    it("validates a correct GeoJSON Point", () => {
      const validPoint = {
        type: "Point",
        coordinates: [67.0099, 24.8607], // [lng, lat]
      };
      const result = GeoPointSchema.safeParse(validPoint);
      expect(result.success).toBe(true);
    });

    it("rejects coordinates exceeding WGS84 bounds", () => {
      const invalidPoint = {
        type: "Point",
        coordinates: [200, 95], // out of bounds
      };
      const result = GeoPointSchema.safeParse(invalidPoint);
      expect(result.success).toBe(false);
    });

    it("validates a LineString with at least 2 points", () => {
      const validLine = {
        type: "LineString",
        coordinates: [
          [67.01, 24.86],
          [67.02, 24.87],
        ],
      };
      const result = GeoLineStringSchema.safeParse(validLine);
      expect(result.success).toBe(true);
    });
  });

  describe("Auth Schemas", () => {
    it("validates valid registration payload", () => {
      const valid = {
        phone: "+923001234567",
        fullName: "Muhammad Ali",
        password: "SecurePassword123!",
        role: "CONSUMER",
      };
      const result = RegisterRequestSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects privileged roles during public registration", () => {
      const invalid = {
        phone: "+923001234567",
        fullName: "Attacker",
        password: "password123",
        role: "ADMIN",
      };
      const result = RegisterRequestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("Driver Schemas", () => {
    it("validates valid driver onboarding payload", () => {
      const valid = {
        licenceNumber: "DL-123456",
        vehicleMake: "Toyota",
        vehicleModel: "HiAce",
        vehicleYear: 2022,
        vehicleColour: "White",
        plateNumber: "ABC-123",
        seatCapacity: 14,
        routePolyline: {
          type: "LineString",
          coordinates: [
            [67.01, 24.86],
            [67.05, 24.9],
          ],
        },
        operatingDays: [0, 1, 2, 3, 4],
        basePriceCents: 1500000,
        currency: "PKR",
      };
      const result = OnboardDriverRequestSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects invalid seat capacity outside 1-50", () => {
      const invalid = {
        licenceNumber: "DL-123456",
        vehicleMake: "Toyota",
        vehicleModel: "Bus",
        vehicleYear: 2020,
        vehicleColour: "White",
        plateNumber: "BUS-999",
        seatCapacity: 60, // > 50
        routePolyline: {
          type: "LineString",
          coordinates: [
            [67.01, 24.86],
            [67.05, 24.9],
          ],
        },
        operatingDays: [1, 2],
        basePriceCents: 5000,
        currency: "PKR",
      };
      const result = OnboardDriverRequestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("Search & Subscription Schemas", () => {
    it("validates search request with 24h time format", () => {
      const valid = {
        pickupLocation: { type: "Point", coordinates: [67.01, 24.86] },
        dropoffLocation: { type: "Point", coordinates: [67.08, 24.92] },
        operatingDays: [0, 1, 2, 3, 4],
        timeWindowStart: "07:30",
        timeWindowEnd: "08:30",
        radiusMeters: 500,
      };
      const result = SearchRoutesRequestSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe("Error Envelope & Error Codes", () => {
    it("contains all 9 TRD §5.10 error codes", () => {
      const codes = [
        "VALIDATION_ERROR",
        "UNAUTHENTICATED",
        "FORBIDDEN",
        "NOT_FOUND",
        "CONFLICT",
        "UNPROCESSABLE",
        "RATE_LIMITED",
        "SERVICE_UNAVAILABLE",
        "INTERNAL_ERROR",
      ];
      for (const code of codes) {
        expect(ErrorCodeSchema.safeParse(code).success).toBe(true);
      }
    });

    it("validates standard ErrorEnvelope structure without leaking data", () => {
      const envelope = {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down.",
        },
        meta: {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
        },
      };
      const result = ErrorEnvelopeSchema.safeParse(envelope);
      expect(result.success).toBe(true);
    });
  });
});

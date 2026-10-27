import {
  RegisterRequestSchema,
  OnboardDriverRequestSchema,
  SetDriverRouteFromLocationsSchema,
  RouteLocationSchema,
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

    it("accepts onboarding payload without routePolyline (field is now optional)", () => {
      const payload = {
        licenceNumber: "DL-123456",
        vehicleMake: "Toyota",
        vehicleModel: "HiAce",
        vehicleYear: 2022,
        vehicleColour: "White",
        plateNumber: "ABC-124",
        seatCapacity: 14,
        operatingDays: [1, 2, 3, 4, 5],
        basePriceCents: 1500000,
        currency: "PKR",
        // routePolyline deliberately omitted
      };
      const result = OnboardDriverRequestSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("Location-Search Route Schemas", () => {
    const validLocation = {
      address: "DHA Phase 5, Karachi",
      lat: 24.8198,
      lng: 67.0824,
    };

    it("validates SetDriverRouteFromLocations with 2+ locations", () => {
      const result = SetDriverRouteFromLocationsSchema.safeParse({
        locations: [
          validLocation,
          { address: "I.I. Chundrigar Road", lat: 24.8607, lng: 67.0099 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects SetDriverRouteFromLocations with fewer than 2 locations", () => {
      const result = SetDriverRouteFromLocationsSchema.safeParse({
        locations: [validLocation],
      });
      expect(result.success).toBe(false);
    });

    it("rejects SetDriverRouteFromLocations with more than 20 locations", () => {
      const locations = Array.from({ length: 21 }, (_, i) => ({
        ...validLocation,
        address: `Stop ${i}`,
      }));
      const result = SetDriverRouteFromLocationsSchema.safeParse({ locations });
      expect(result.success).toBe(false);
    });

    it("rejects RouteLocation with out-of-range latitude", () => {
      const result = RouteLocationSchema.safeParse({
        ...validLocation,
        lat: 95,
      });
      expect(result.success).toBe(false);
    });

    it("rejects RouteLocation with out-of-range longitude", () => {
      const result = RouteLocationSchema.safeParse({
        ...validLocation,
        lng: 200,
      });
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

  describe("Internal Matching Contracts & Eligibility Vectors (AD-5, AD-11)", () => {
    it("validates a well-formed InternalSearchRequest", async () => {
      const { InternalSearchRequestSchema } = await import("./index.js");
      const valid = {
        riderId: "550e8400-e29b-41d4-a716-446655440000",
        pickupLat: 24.86,
        pickupLng: 67.01,
        destLat: 24.92,
        destLng: 67.11,
        day: 1,
        departureTime: "07:30",
        subscriptionType: "ONE_WAY",
        pickupRadiusMeters: 1500,
        destRadiusMeters: 2000,
      };
      const result = InternalSearchRequestSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects ROUND_TRIP InternalSearchRequest without pickupTime", async () => {
      const { InternalSearchRequestSchema } = await import("./index.js");
      const invalid = {
        riderId: "550e8400-e29b-41d4-a716-446655440000",
        pickupLat: 24.86,
        pickupLng: 67.01,
        destLat: 24.92,
        destLng: 67.11,
        day: 1,
        departureTime: "07:30",
        subscriptionType: "ROUND_TRIP",
      };
      const result = InternalSearchRequestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("loads and validates the shared test vectors file", async () => {
      const { ExclusionCodeSchema } = await import("./index.js");
      const fs = await import("node:fs");
      const path = await import("node:path");

      const vectorPath = path.resolve(__dirname, "../test-vectors/eligibility.json");
      expect(fs.existsSync(vectorPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(vectorPath, "utf-8"));
      expect(content.version).toBe("1.0.0");
      expect(Array.isArray(content.vectors)).toBe(true);
      expect(content.vectors.length).toBeGreaterThanOrEqual(10);

      const seenStages = new Set<string>();
      for (const vector of content.vectors) {
        expect(vector.id).toBeDefined();
        expect(vector.stage).toBeDefined();
        seenStages.add(vector.stage);

        if (vector.expectedExclusionCode) {
          const parsedCode = ExclusionCodeSchema.safeParse(vector.expectedExclusionCode);
          expect(parsedCode.success).toBe(true);
        }
      }

      // Assert all canonical stages E1-E7 plus ELIGIBLE are present
      for (let i = 1; i <= 7; i++) {
        expect(seenStages.has(`E${i}`)).toBe(true);
      }
      expect(seenStages.has("ELIGIBLE")).toBe(true);
    });

    it("validates and coerces DriverSearchQuerySchema", async () => {
      const { DriverSearchQuerySchema } = await import("./index.js");
      const query = {
        riderId: "550e8400-e29b-41d4-a716-446655440000",
        pickupLat: "24.860000",
        pickupLng: "67.010000",
        destLat: "24.920000",
        destLng: "67.110000",
        day: "1",
        departureTime: "07:30",
        subscriptionType: "ONE_WAY",
      };
      const parsed = DriverSearchQuerySchema.safeParse(query);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.pickupLat).toBe(24.86);
        expect(parsed.data.day).toBe(1);
      }
    });

    it("rejects ROUND_TRIP DriverSearchQuery without pickupTime", async () => {
      const { DriverSearchQuerySchema } = await import("./index.js");
      const invalid = {
        riderId: "550e8400-e29b-41d4-a716-446655440000",
        day: 2,
        departureTime: "08:00",
        subscriptionType: "ROUND_TRIP",
      };
      const result = DriverSearchQuerySchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates well-formed DriverSearchResponseDataSchema and envelope", async () => {
      const { DriverSearchResponseSchema } = await import("./index.js");
      const payload = {
        data: {
          results: [
            {
              driverProfileId: "550e8400-e29b-41d4-a716-446655440000",
              driverName: "Ahmed Khan",
              driverRating: 4.8,
              vehicleMake: "Toyota",
              vehicleModel: "HiAce",
              vehicleColour: "White",
              monthlyPriceCents: 1500000,
              currency: "PKR",
              pickupWalkDistanceMeters: 250.5,
              dropoffWalkDistanceMeters: 310.2,
              estimatedPickupTime: "07:35",
              estimatedDropoffTime: "08:15",
              availableSeats: 3,
              matchScore: 0.895,
            },
          ],
          count: 1,
          totalEligible: 1,
          searchRadiusMetres: 1500,
        },
        meta: {
          requestId: "req-12345",
          timestamp: "2026-10-08T12:00:00.000Z",
        },
      };
      const result = DriverSearchResponseSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});

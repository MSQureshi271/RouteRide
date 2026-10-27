/**
 * Integration tests for T0.39 — Route Polyline Definition and Validation.
 *
 * Tests verify:
 *  - 200 valid route update returns updated profile
 *  - 422 route coordinates outside launch city bounding box
 *  - 400 schema rejects coordinate with longitude out of range
 *  - 400 schema rejects coordinate with latitude out of range
 *  - 400 schema rejects single-point LineString (requires min 2 points)
 *  - 400 schema rejects zero-length line (all identical coordinates)
 *  - 404 driver profile not found
 */
jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    DRIVER_PRICE_MIN_CENTS: 500000,
    DRIVER_PRICE_MAX_CENTS: 50000000,
    LAUNCH_CITY_NAME: "Karachi",
    LAUNCH_CITY_BBOX_MIN_LAT: 24.75,
    LAUNCH_CITY_BBOX_MAX_LAT: 25.1,
    LAUNCH_CITY_BBOX_MIN_LON: 66.85,
    LAUNCH_CITY_BBOX_MAX_LON: 67.35,
  }),
}));

import {
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DriversService } from "../src/drivers/drivers.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { GeoLineStringSchema } from "@routeride/contracts";

const MOCK_PROFILE_ROW = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "11111111-1111-1111-1111-111111111111",
  licence_number: "LIC-001",
  vehicle_make: "Toyota",
  vehicle_model: "Corolla",
  vehicle_year: 2020,
  vehicle_colour: "White",
  plate_number: "KHI-001",
  seat_capacity: 4,
  operating_days: [1, 2, 3],
  base_price_cents: 1000000,
  currency: "PKR",
  status: "PENDING",
  verification_tier: "TIER_1",
  acceptance_rate: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

function makeMockPrisma(profileExists = true, geometryValid = true) {
  const mock = {
    sql: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("AS valid"))
        return Promise.resolve([{ valid: geometryValid }]);
      if (query.includes("SELECT") && query.includes("FROM driver_profiles")) {
        return Promise.resolve(profileExists ? [MOCK_PROFILE_ROW] : []);
      }
      if (query.includes("UPDATE driver_profiles")) {
        return Promise.resolve(profileExists ? [MOCK_PROFILE_ROW] : []);
      }
      return Promise.resolve([]);
    }),
  };
  return {
    ...mock,
    pool: {
      connect: async () => ({
        query: async (text: string) => ({
          rows: await mock.sql([text] as unknown as TemplateStringsArray),
        }),
        release: jest.fn(),
      }),
    },
  } as unknown as PrismaService;
}

describe("Driver Route Validation (T0.39)", () => {
  it("rejects non-simple established geometry instead of hiding the driver after save", async () => {
    const service = new DriversService(makeMockPrisma(true, false));
    await expect(
      service.updateRoute(MOCK_PROFILE_ROW.user_id, {
        type: "LineString",
        coordinates: [
          [67.01, 24.86],
          [67.05, 24.89],
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
  it("200 — updates route when coordinates are valid and inside launch city bbox", async () => {
    const prisma = makeMockPrisma(true);
    const service = new DriversService(prisma);

    const validRoute = {
      type: "LineString" as const,
      coordinates: [
        [67.01, 24.86] as [number, number],
        [67.05, 24.89] as [number, number],
      ],
    };

    const profile = await service.updateRoute(
      MOCK_PROFILE_ROW.user_id,
      validRoute,
    );
    expect(profile.id).toBe(MOCK_PROFILE_ROW.id);
  });

  it("422 — rejects route when coordinates fall outside the launch city bbox", async () => {
    const prisma = makeMockPrisma(true);
    const service = new DriversService(prisma);

    const outsideBboxRoute = {
      type: "LineString" as const,
      coordinates: [
        [74.35, 31.52] as [number, number], // Lahore coordinates, outside Karachi bbox
        [74.4, 31.55] as [number, number],
      ],
    };

    await expect(
      service.updateRoute(MOCK_PROFILE_ROW.user_id, outsideBboxRoute),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("404 — throws NotFoundException when driver profile does not exist", async () => {
    const prisma = makeMockPrisma(false);
    const service = new DriversService(prisma);

    const validRoute = {
      type: "LineString" as const,
      coordinates: [
        [67.01, 24.86] as [number, number],
        [67.05, 24.89] as [number, number],
      ],
    };

    await expect(
      service.updateRoute("non-existent-user", validRoute),
    ).rejects.toThrow(NotFoundException);
  });

  it("schema rejects single-point LineString", () => {
    const result = GeoLineStringSchema.safeParse({
      type: "LineString",
      coordinates: [[67.01, 24.86]],
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects zero-length line (all identical points)", () => {
    const result = GeoLineStringSchema.safeParse({
      type: "LineString",
      coordinates: [
        [67.01, 24.86],
        [67.01, 24.86],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects longitude out of range", () => {
    const result = GeoLineStringSchema.safeParse({
      type: "LineString",
      coordinates: [
        [185.0, 24.86],
        [67.05, 24.89],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects latitude out of range", () => {
    const result = GeoLineStringSchema.safeParse({
      type: "LineString",
      coordinates: [
        [67.01, 95.0],
        [67.05, 24.89],
      ],
    });
    expect(result.success).toBe(false);
  });

  describe("setRouteFromLocations", () => {
    it("200 — builds GeoJSON line and updates profile when given 3 valid locations", async () => {
      const prisma = makeMockPrisma(true);
      const service = new DriversService(prisma);

      const locationsDto = {
        locations: [
          { address: "Clifton Block 2", lat: 24.815, lng: 67.028 },
          { address: "Saddar", lat: 24.856, lng: 67.015 },
          { address: "Gulshan-e-Iqbal", lat: 24.918, lng: 67.097 },
        ],
      };

      const profile = await service.setRouteFromLocations(
        MOCK_PROFILE_ROW.user_id,
        locationsDto,
      );
      expect(profile.id).toBe(MOCK_PROFILE_ROW.id);
    });

    it("422 — throws UnprocessableEntityException if any location is outside launch city bbox", async () => {
      const prisma = makeMockPrisma(true);
      const service = new DriversService(prisma);

      const outsideLocationsDto = {
        locations: [
          { address: "Clifton Block 2", lat: 24.815, lng: 67.028 },
          { address: "Islamabad Blue Area", lat: 33.729, lng: 73.093 }, // Outside Karachi bbox
        ],
      };

      await expect(
        service.setRouteFromLocations(
          MOCK_PROFILE_ROW.user_id,
          outsideLocationsDto,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it("404 — throws NotFoundException when driver profile does not exist", async () => {
      const prisma = makeMockPrisma(false);
      const service = new DriversService(prisma);

      const locationsDto = {
        locations: [
          { address: "Clifton Block 2", lat: 24.815, lng: 67.028 },
          { address: "Saddar", lat: 24.856, lng: 67.015 },
        ],
      };

      await expect(
        service.setRouteFromLocations("missing-user", locationsDto),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

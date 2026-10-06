/**
 * Integration tests for T0.37 — Driver Profile and Vehicle Onboarding.
 *
 * Tests verify:
 *  - 201 valid onboard payload → status PENDING
 *  - 409 duplicate profile (same user)
 *  - 409 duplicate plate number (unique constraint violation 23505)
 *  - 422 basePriceCents below platform minimum
 *  - 422 basePriceCents above platform maximum
 *  - 400 seatCapacity: 0 (below minimum)
 *  - 400 seatCapacity: 51 (above maximum)
 *  - 400 vehicleYear: 1989 (below minimum)
 *  - 400 operatingDays: [] (empty)
 *  - 400 operatingDays: [1,1] (duplicates rejected)
 *  - 200 getMyProfile returns profile after onboard
 *  - 404 getMyProfile before onboard
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
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DriversService } from "../src/drivers/drivers.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { OnboardDriverRequestSchema } from "@routeride/contracts";

const VALID_DTO = {
  licenceNumber: "LIC-TEST-001",
  vehicleMake: "Toyota",
  vehicleModel: "Corolla",
  vehicleYear: 2020,
  vehicleColour: "White",
  plateNumber: "KHI-UNIQUE-001",
  seatCapacity: 4,
  routePolyline: {
    type: "LineString" as const,
    coordinates: [
      [67.01, 24.86] as [number, number],
      [67.05, 24.89] as [number, number],
    ],
  },
  operatingDays: [1, 2, 3],
  basePriceCents: 1000000,
  currency: "PKR",
};

const MOCK_ROW = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "11111111-1111-1111-1111-111111111111",
  licence_number: VALID_DTO.licenceNumber,
  vehicle_make: VALID_DTO.vehicleMake,
  vehicle_model: VALID_DTO.vehicleModel,
  vehicle_year: VALID_DTO.vehicleYear,
  vehicle_colour: VALID_DTO.vehicleColour,
  plate_number: VALID_DTO.plateNumber,
  seat_capacity: VALID_DTO.seatCapacity,
  operating_days: VALID_DTO.operatingDays,
  base_price_cents: VALID_DTO.basePriceCents,
  currency: VALID_DTO.currency,
  status: "PENDING",
  verification_tier: "TIER_1",
  acceptance_rate: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

function makeMockPrisma(existingProfile = false, throwDuplicatePlate = false) {
  return {
    sql: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("SELECT id FROM driver_profiles")) {
        return Promise.resolve(existingProfile ? [{ id: MOCK_ROW.id }] : []);
      }
      if (query.includes("INSERT INTO driver_profiles")) {
        if (throwDuplicatePlate) {
          const err = new Error(
            "duplicate key value violates unique constraint",
          ) as Error & { code: string };
          err.code = "23505";
          return Promise.reject(err);
        }
        return Promise.resolve([MOCK_ROW]);
      }
      if (query.includes("SELECT") && query.includes("FROM driver_profiles")) {
        return Promise.resolve(existingProfile ? [MOCK_ROW] : []);
      }
      return Promise.resolve([]);
    }),
  } as unknown as PrismaService;
}

describe("Driver Onboarding (T0.37)", () => {
  it("creates a PENDING driver profile with valid payload", async () => {
    const prisma = makeMockPrisma(false);
    const service = new DriversService(prisma);

    const profile = await service.onboard(MOCK_ROW.user_id, VALID_DTO);

    expect(profile.status).toBe("PENDING");
    expect(profile.id).toBe(MOCK_ROW.id);
    expect(profile.licenceNumber).toBe(VALID_DTO.licenceNumber);
    expect(profile.plateNumber).toBe(VALID_DTO.plateNumber);
    expect(profile.basePriceCents).toBe(VALID_DTO.basePriceCents);
  });

  it("409 — duplicate onboard attempt returns conflict", async () => {
    const prisma = makeMockPrisma(true); // already has profile
    const service = new DriversService(prisma);

    await expect(service.onboard(MOCK_ROW.user_id, VALID_DTO)).rejects.toThrow(
      ConflictException,
    );
  });

  it("409 — duplicate plate number returns conflict", async () => {
    const prisma = makeMockPrisma(false, true); // duplicate plate
    const service = new DriversService(prisma);

    await expect(service.onboard(MOCK_ROW.user_id, VALID_DTO)).rejects.toThrow(
      ConflictException,
    );
  });

  it("422 — price below platform minimum is rejected", async () => {
    const prisma = makeMockPrisma(false);
    const service = new DriversService(prisma);

    await expect(
      service.onboard(MOCK_ROW.user_id, { ...VALID_DTO, basePriceCents: 100 }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("422 — price above platform maximum is rejected", async () => {
    const prisma = makeMockPrisma(false);
    const service = new DriversService(prisma);

    await expect(
      service.onboard(MOCK_ROW.user_id, {
        ...VALID_DTO,
        basePriceCents: 999999999,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("schema rejects seatCapacity: 0 (below minimum)", () => {
    const result = OnboardDriverRequestSchema.safeParse({
      ...VALID_DTO,
      seatCapacity: 0,
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects seatCapacity: 51 (above maximum)", () => {
    const result = OnboardDriverRequestSchema.safeParse({
      ...VALID_DTO,
      seatCapacity: 51,
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects vehicleYear: 1989 (below minimum)", () => {
    const result = OnboardDriverRequestSchema.safeParse({
      ...VALID_DTO,
      vehicleYear: 1989,
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects operatingDays: [] (empty)", () => {
    const result = OnboardDriverRequestSchema.safeParse({
      ...VALID_DTO,
      operatingDays: [],
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects operatingDays: [1, 1] (duplicate days)", () => {
    const result = OnboardDriverRequestSchema.safeParse({
      ...VALID_DTO,
      operatingDays: [1, 1],
    });
    expect(result.success).toBe(false);
  });

  it("getMyProfile returns profile when exists", async () => {
    const prisma = makeMockPrisma(true);
    const service = new DriversService(prisma);

    const profile = await service.getMyProfile(MOCK_ROW.user_id);
    expect(profile.id).toBe(MOCK_ROW.id);
  });

  it("getMyProfile throws NotFoundException when profile absent", async () => {
    const prisma = makeMockPrisma(false);
    const service = new DriversService(prisma);

    await expect(service.getMyProfile(MOCK_ROW.user_id)).rejects.toThrow(
      NotFoundException,
    );
  });
});

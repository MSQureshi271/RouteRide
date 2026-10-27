/**
 * Integration tests for T0.40 — Availability, Pricing, and Platform Guardrails.
 *
 * Tests verify:
 *  - 200 updates price within valid platform bounds
 *  - 422 rejects price below DRIVER_PRICE_MIN_CENTS
 *  - 422 rejects price above DRIVER_PRICE_MAX_CENTS
 *  - 200 updates operating days successfully
 *  - 409 rejects dropping an operating day that has active subscriptions
 *  - 400 schema rejects duplicate operating days
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
  UnprocessableEntityException,
} from "@nestjs/common";
import { DriversService } from "../src/drivers/drivers.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { UpdateDriverAvailabilitySchema } from "@routeride/contracts";

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
  operating_days: [1, 2, 3, 4, 5],
  base_price_cents: 1000000,
  currency: "PKR",
  status: "PENDING",
  verification_tier: "TIER_1",
  acceptance_rate: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

function makeMockPrisma(
  activeSubConflict = false,
  configuredDays: number[] = [],
) {
  const mock = {
    sql: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("SELECT") && query.includes("FROM driver_profiles")) {
        return Promise.resolve([MOCK_PROFILE_ROW]);
      }
      if (query.includes("driver_schedule_slots")) {
        return Promise.resolve([{ cnt: activeSubConflict ? "1" : "0" }]);
      }
      if (query.includes("FROM driver_availability")) {
        return Promise.resolve(
          configuredDays.map((operating_day) => ({ operating_day })),
        );
      }
      if (query.includes("UPDATE driver_profiles")) {
        return Promise.resolve([MOCK_PROFILE_ROW]);
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

describe("Driver Pricing and Availability (T0.40)", () => {
  it("requires canonical coverage settings to change offered days once configured", async () => {
    const service = new DriversService(makeMockPrisma(false, [1, 2, 3, 4, 5]));
    await expect(
      service.updateAvailability(MOCK_PROFILE_ROW.user_id, {
        operatingDays: [1],
      }),
    ).rejects.toThrow(ConflictException);
  });
  it("200 — updates price within platform bounds", async () => {
    const prisma = makeMockPrisma(false);
    const service = new DriversService(prisma);

    const profile = await service.updateAvailability(MOCK_PROFILE_ROW.user_id, {
      basePriceCents: 2000000,
    });
    expect(profile.id).toBe(MOCK_PROFILE_ROW.id);
  });

  it("422 — rejects price below platform minimum", async () => {
    const prisma = makeMockPrisma(false);
    const service = new DriversService(prisma);

    await expect(
      service.updateAvailability(MOCK_PROFILE_ROW.user_id, {
        basePriceCents: 1000,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("422 — rejects price above platform maximum", async () => {
    const prisma = makeMockPrisma(false);
    const service = new DriversService(prisma);

    await expect(
      service.updateAvailability(MOCK_PROFILE_ROW.user_id, {
        basePriceCents: 999999999,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("200 — updates operating days when no active subscription conflicts", async () => {
    const prisma = makeMockPrisma(false);
    const service = new DriversService(prisma);

    const profile = await service.updateAvailability(MOCK_PROFILE_ROW.user_id, {
      operatingDays: [1, 2, 3], // dropped 4, 5 but no active subs
    });
    expect(profile.id).toBe(MOCK_PROFILE_ROW.id);
  });

  it("409 — rejects dropping an operating day that has active subscriptions", async () => {
    const prisma = makeMockPrisma(true); // active subscription conflict!
    const service = new DriversService(prisma);

    await expect(
      service.updateAvailability(MOCK_PROFILE_ROW.user_id, {
        operatingDays: [1, 2, 3], // dropping 4, 5
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("schema rejects duplicate operating days", () => {
    const result = UpdateDriverAvailabilitySchema.safeParse({
      operatingDays: [1, 1, 2],
    });
    expect(result.success).toBe(false);
  });
});

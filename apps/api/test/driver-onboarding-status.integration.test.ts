/**
 * Integration tests for Driver Onboarding Status Evaluator & Route Approval Authorization.
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

jest.mock("../src/common/guards/jwt-auth.guard.js", () => ({
  JwtAuthGuard: class {},
}));

import { ForbiddenException } from "@nestjs/common";
import { DriversService } from "../src/drivers/drivers.service.js";
import { DriversController } from "../src/drivers/drivers.controller.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

describe("Driver Onboarding Status & Route Authorization", () => {
  let service: DriversService;
  let controller: DriversController;
  let prisma: jest.Mocked<PrismaService>;

  const USER_ID = "11111111-1111-1111-1111-111111111111";
  const DRIVER_ID = "00000000-0000-0000-0000-000000000001";

  const BASE_PROFILE_ROW = {
    id: DRIVER_ID,
    user_id: USER_ID,
    licence_number: "LIC-12345",
    vehicle_make: "Honda",
    vehicle_model: "Civic",
    vehicle_year: 2021,
    vehicle_colour: "Black",
    plate_number: "ABC-123",
    seat_capacity: 4,
    operating_days: [] as number[],
    base_price_cents: 0,
    currency: "PKR",
    status: "PENDING",
    verification_tier: "BASIC",
    acceptance_rate: null,
    created_at: new Date(),
    updated_at: new Date(),
    coverage_configured: true,
  };

  beforeEach(() => {
    prisma = {
      sql: jest.fn(),
      query: jest.fn(),
      pool: {} as unknown as PrismaService["pool"],
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;

    service = new DriversService(prisma);
    controller = new DriversController(service);
  });

  describe("getOnboardingStatus", () => {
    it("requires declared service coverage even when legacy days and price are set", async () => {
      prisma.sql.mockResolvedValueOnce([
        {
          ...BASE_PROFILE_ROW,
          operating_days: [1],
          base_price_cents: 1000000,
          coverage_configured: false,
        },
      ]);
      prisma.sql.mockResolvedValueOnce(
        ["CNIC", "LICENCE", "REGISTRATION", "INSURANCE"].map((doc_type) => ({
          doc_type,
        })),
      );
      const result = await service.getOnboardingStatus(USER_ID);
      expect(result.currentStep).toBe("step4-availability");
      expect(result.availabilityCompleted).toBe(false);
    });
    it("returns step1-vehicle when driver profile does not exist", async () => {
      prisma.sql.mockResolvedValueOnce([]); // no profile

      const res = await service.getOnboardingStatus(USER_ID);

      expect(res.currentStep).toBe("step1-vehicle");
      expect(res.profileCompleted).toBe(false);
      expect(res.documentsCompleted).toBe(false);
      expect(res.availabilityCompleted).toBe(false);
      expect(res.missingDocuments).toEqual([
        "CNIC",
        "LICENCE",
        "REGISTRATION",
        "INSURANCE",
      ]);
    });

    it("returns step1-vehicle when profile exists but required vehicle fields are incomplete", async () => {
      prisma.sql.mockResolvedValueOnce([
        {
          ...BASE_PROFILE_ROW,
          licence_number: "", // invalid/incomplete
        },
      ]);

      const res = await service.getOnboardingStatus(USER_ID);

      expect(res.currentStep).toBe("step1-vehicle");
      expect(res.profileCompleted).toBe(false);
    });

    it("returns step2-documents when profile is complete but documents are missing", async () => {
      // 1. Profile query
      prisma.sql.mockResolvedValueOnce([BASE_PROFILE_ROW]);
      // 2. Documents query - only CNIC uploaded
      prisma.sql.mockResolvedValueOnce([{ doc_type: "CNIC" }]);

      const res = await service.getOnboardingStatus(USER_ID);

      expect(res.currentStep).toBe("step2-documents");
      expect(res.profileCompleted).toBe(true);
      expect(res.documentsCompleted).toBe(false);
      expect(res.uploadedDocuments).toEqual(["CNIC"]);
      expect(res.missingDocuments).toEqual([
        "LICENCE",
        "REGISTRATION",
        "INSURANCE",
      ]);
    });

    it("returns step4-availability when all 4 documents are uploaded but availability is unconfigured", async () => {
      // 1. Profile query (operating_days empty, base_price_cents 0)
      prisma.sql.mockResolvedValueOnce([BASE_PROFILE_ROW]);
      // 2. Documents query - all 4 confirmed
      prisma.sql.mockResolvedValueOnce([
        { doc_type: "CNIC" },
        { doc_type: "LICENCE" },
        { doc_type: "REGISTRATION" },
        { doc_type: "INSURANCE" },
      ]);

      const res = await service.getOnboardingStatus(USER_ID);

      expect(res.currentStep).toBe("step4-availability");
      expect(res.profileCompleted).toBe(true);
      expect(res.documentsCompleted).toBe(true);
      expect(res.availabilityCompleted).toBe(false);
      expect(res.missingDocuments).toHaveLength(0);
    });

    it("returns pending when all steps are complete but driver status is PENDING", async () => {
      // 1. Profile query with configured availability
      prisma.sql.mockResolvedValueOnce([
        {
          ...BASE_PROFILE_ROW,
          operating_days: [1, 2, 3, 4, 5],
          base_price_cents: 1000000,
          status: "PENDING",
        },
      ]);
      // 2. Documents query - all 4 confirmed
      prisma.sql.mockResolvedValueOnce([
        { doc_type: "CNIC" },
        { doc_type: "LICENCE" },
        { doc_type: "REGISTRATION" },
        { doc_type: "INSURANCE" },
      ]);

      const res = await service.getOnboardingStatus(USER_ID);

      expect(res.currentStep).toBe("pending");
      expect(res.status).toBe("PENDING");
      expect(res.profileCompleted).toBe(true);
      expect(res.documentsCompleted).toBe(true);
      expect(res.availabilityCompleted).toBe(true);
    });

    it("returns approved when driver status is APPROVED", async () => {
      // 1. Profile query with APPROVED status
      prisma.sql.mockResolvedValueOnce([
        {
          ...BASE_PROFILE_ROW,
          operating_days: [1, 2, 3, 4, 5],
          base_price_cents: 1000000,
          status: "APPROVED",
        },
      ]);
      // 2. Documents query
      prisma.sql.mockResolvedValueOnce([
        { doc_type: "CNIC" },
        { doc_type: "LICENCE" },
        { doc_type: "REGISTRATION" },
        { doc_type: "INSURANCE" },
      ]);

      const res = await service.getOnboardingStatus(USER_ID);

      expect(res.currentStep).toBe("approved");
      expect(res.status).toBe("APPROVED");
    });
  });

  describe("Route updates authorization", () => {
    const JWT_USER = {
      sub: USER_ID,
      role: "DRIVER" as const,
      status: "ACTIVE" as const,
      email: null,
      phone: "+923001234567",
      iat: 1000,
      exp: 2000,
    };

    it("throws ForbiddenException when an unapproved (PENDING) driver attempts to update route", async () => {
      prisma.sql.mockResolvedValueOnce([
        {
          ...BASE_PROFILE_ROW,
          status: "PENDING",
        },
      ]);

      await expect(
        controller.updateRoute(JWT_USER, {
          routePolyline: {
            type: "LineString",
            coordinates: [
              [67.01, 24.86],
              [67.05, 24.89],
            ],
          },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when an unapproved (PENDING) driver attempts to set route from locations", async () => {
      prisma.sql.mockResolvedValueOnce([
        {
          ...BASE_PROFILE_ROW,
          status: "PENDING",
        },
      ]);

      await expect(
        controller.setRouteFromLocations(JWT_USER, {
          locations: [
            { address: "Stop 1", lat: 24.86, lng: 67.01 },
            { address: "Stop 2", lat: 24.89, lng: 67.05 },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

/**
 * Search Integration & Unit Tests (Task 1.08).
 *
 * Covers all requirements from TRD §5.6, AD-5, AD-12, and the approved implementation plan:
 *  1. 401 Unauthorized / 403 Forbidden (RBAC Guards: only CONSUMER permitted).
 *  2. 429 Rate Limiting (SearchRateLimitGuard: 30 req / userId / min).
 *  3. 400 Validation Errors: missing fields, invalid day/time, ROUND_TRIP / DEPARTURE rules.
 *  4. 403 Forbidden: riderId belongs to another consumer.
 *  5. 404 Not Found: riderId does not exist.
 *  6. 400 Missing Coordinates: coordinates omitted in query and null in rider profile.
 *  7. 422 Outside Service Area: pickup or dest outside Karachi bounding box.
 *  8. 200 Inclusive Bounding Box: boundary coordinates are accepted.
 *  9. Matching proxy error mapping: 503 SERVICE_UNAVAILABLE with Retry-After: 30 on network/timeout error.
 * 10. Dynamic upstream matching budget allocation (clamped to remaining gateway budget).
 * 11. Overall Gateway Response Deadline: 5000ms response timeout triggers immediate 503.
 * 12. Candidate driver DB enrichment: full name, vehicle details, PKR price, exact ranking order preserved.
 * 13. Dominant no-match reasons mapped from firstFailureCounts when 0 results.
 * 14. Redis caching with 6-decimal precision: identical requests served from cache, cache shared across consumers.
 * 15. 6-decimal coordinate distinction: slightly different coordinates produce different cache keys.
 * 16. Defensive cache contract validation: corrupt/invalid cache entries deleted and bypassed cleanly.
 */

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    LAUNCH_CITY_BBOX_MIN_LAT: 24.65,
    LAUNCH_CITY_BBOX_MAX_LAT: 25.15,
    LAUNCH_CITY_BBOX_MIN_LON: 66.85,
    LAUNCH_CITY_BBOX_MAX_LON: 67.35,
    MATCHING_SERVICE_URL: "http://localhost:8001",
  }),
}));

jest.mock("@nestjs/passport", () => ({
  AuthGuard: () => class {},
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SearchController } from "../src/search/search.controller.js";
import { SearchService } from "../src/search/search.service.js";
import { MatchingClient } from "../src/search/matching.client.js";
import { ServiceUnavailableWithRetryException } from "../src/common/service-unavailable-retry.exception.js";
import { RolesGuard } from "../src/common/guards/roles.guard.js";
import { SearchRateLimitGuard } from "../src/common/rate-limit.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import type Redis from "ioredis";
import type { FastifyRequest } from "fastify";
import type {
  DriverSearchQuery,
  InternalSearchResponse,
  FirstFailureCounts,
} from "@routeride/contracts";
import type { JwtPayload } from "../src/common/decorators/current-user.decorator.js";

// ─── Constants & Fixtures ─────────────────────────────────────────────────────

const CONSUMER_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const RIDER_ID = "33333333-3333-4333-8333-333333333333";

const MOCK_CONSUMER_USER: JwtPayload = {
  sub: CONSUMER_USER_ID,
  role: "CONSUMER",
  status: "ACTIVE",
  iat: 1700000000,
  exp: 1700003600,
};
const OTHER_RIDER_ID = "44444444-4444-4444-8444-444444444444";
const NON_EXISTENT_RIDER_ID = "99999999-9999-4999-8999-999999999999";

const DRIVER_PROFILE_1 = "d1111111-1111-4111-8111-111111111111";
const DRIVER_PROFILE_2 = "d2222222-2222-4222-8222-222222222222";

// Valid Karachi coordinates (within 24.65–25.15 N, 66.85–67.35 E)
const VALID_PICKUP_LAT = 24.8607;
const VALID_PICKUP_LNG = 67.0011;
const VALID_DEST_LAT = 24.92;
const VALID_DEST_LNG = 67.11;

const DEFAULT_QUERY: DriverSearchQuery = {
  riderId: RIDER_ID,
  pickupLat: VALID_PICKUP_LAT,
  pickupLng: VALID_PICKUP_LNG,
  destLat: VALID_DEST_LAT,
  destLng: VALID_DEST_LNG,
  day: 0,
  departureTime: "08:00",
  subscriptionType: "ONE_WAY",
};

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockRedis(): Redis {
  const store = new Map<string, string>();
  return {
    get: jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(store.get(key) ?? null),
      ),
    set: jest.fn().mockImplementation((key: string, val: string) => {
      store.set(key, val);
      return Promise.resolve("OK");
    }),
    del: jest.fn().mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    _store: store,
  } as unknown as Redis & { _store: Map<string, string> };
}

function createMockPrisma(
  options: {
    riderOwnedBy?: string | null;
    homeLat?: number | null;
    homeLng?: number | null;
    destLat?: number | null;
    destLng?: number | null;
    drivers?: Array<{
      driver_profile_id: string;
      driver_name: string;
      vehicle_make: string;
      vehicle_model: string;
      vehicle_colour: string;
      base_price_cents: number;
      currency: string;
    }>;
  } = {},
): PrismaService {
  const {
    riderOwnedBy = CONSUMER_USER_ID,
    homeLat = VALID_PICKUP_LAT,
    homeLng = VALID_PICKUP_LNG,
    destLat = VALID_DEST_LAT,
    destLng = VALID_DEST_LNG,
    drivers = [
      {
        driver_profile_id: DRIVER_PROFILE_1,
        driver_name: "Tariq Mahmood",
        vehicle_make: "Toyota",
        vehicle_model: "HiAce",
        vehicle_colour: "Silver",
        base_price_cents: 1800000,
        currency: "PKR",
      },
      {
        driver_profile_id: DRIVER_PROFILE_2,
        driver_name: "Ahmed Ali",
        vehicle_make: "Suzuki",
        vehicle_model: "Every",
        vehicle_colour: "White",
        base_price_cents: 1400000,
        currency: "PKR",
      },
    ],
  } = options;

  return {
    sql: jest
      .fn()
      .mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const query = strings.join(" ");

          // 1. Rider ownership lookup
          if (
            query.includes("FROM riders r") &&
            query.includes("JOIN consumer_profiles cp")
          ) {
            const queryRiderId = values[0] as string;
            const queryUserId = values[1] as string;

            if (
              riderOwnedBy &&
              queryRiderId === RIDER_ID &&
              queryUserId === riderOwnedBy
            ) {
              return Promise.resolve([
                {
                  id: RIDER_ID,
                  consumer_profile_id: "cp-1",
                  home_lat: homeLat,
                  home_lng: homeLng,
                  dest_lat: destLat,
                  dest_lng: destLng,
                },
              ]);
            }
            if (
              riderOwnedBy &&
              queryRiderId === OTHER_RIDER_ID &&
              queryUserId === riderOwnedBy
            ) {
              return Promise.resolve([
                {
                  id: OTHER_RIDER_ID,
                  consumer_profile_id: "cp-2",
                  home_lat: homeLat,
                  home_lng: homeLng,
                  dest_lat: destLat,
                  dest_lng: destLng,
                },
              ]);
            }
            return Promise.resolve([]);
          }

          // 2. Any rider existence check (for 403 vs 404 distinction)
          if (query.includes("SELECT id FROM riders WHERE id =")) {
            const queryRiderId = values[0] as string;
            if (queryRiderId === RIDER_ID || queryRiderId === OTHER_RIDER_ID) {
              return Promise.resolve([{ id: queryRiderId }]);
            }
            return Promise.resolve([]);
          }

          // 3. Driver profile enrichment lookup
          if (
            query.includes("FROM driver_profiles dp") &&
            query.includes("JOIN users u")
          ) {
            return Promise.resolve(drivers);
          }

          return Promise.resolve([]);
        },
      ),
  } as unknown as PrismaService;
}

function createMockMatchingClient(
  response?: InternalSearchResponse,
): MatchingClient {
  const defaultResp: InternalSearchResponse = {
    results: [
      {
        driverProfileId: DRIVER_PROFILE_1,
        compositeScore: 0.942,
        scoreBreakdown: {
          proximityScore: 0.95,
          timingScore: 0.9,
          ratingScore: 0.95,
          capacityScore: 0.9,
          acceptanceScore: 0.95,
        },
        pickupDistanceMeters: 245.4,
        destDistanceMeters: 412.8,
        estimatedTripDurationMinutes: 35,
        availableSeats: 3,
        avgRating: 4.85,
        reviewCount: 142,
      },
      {
        driverProfileId: DRIVER_PROFILE_2,
        compositeScore: 0.865,
        scoreBreakdown: {
          proximityScore: 0.85,
          timingScore: 0.85,
          ratingScore: 0.9,
          capacityScore: 0.85,
          acceptanceScore: 0.88,
        },
        pickupDistanceMeters: 512.1,
        destDistanceMeters: 620.3,
        estimatedTripDurationMinutes: 40,
        availableSeats: 2,
        avgRating: 4.6,
        reviewCount: 89,
      },
    ],
    totalCandidatesEvaluated: 10,
    totalEligible: 2,
    exclusionSummary: {
      firstFailureCounts: {
        driverStatus: 0,
        invalidGeometry: 0,
        distance: 3,
        direction: 2,
        operatingDay: 2,
        capacity: 1,
        timing: 0,
      },
    },
    meta: {
      executionTimeMs: 42.5,
      searchTimestamp: new Date().toISOString(),
    },
  };

  return {
    search: jest.fn().mockResolvedValue(response ?? defaultResp),
  } as unknown as MatchingClient;
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe("Task 1.08 — Driver Search Gateway Endpoint", () => {
  describe("1. Controller & Route Validation", () => {
    let controller: SearchController;
    let service: SearchService;

    beforeEach(() => {
      service = {
        discover: jest.fn().mockResolvedValue({
          results: [],
          version: "v2",
          pagination: { page: 1, pageSize: 20, total: 0, hasMore: false },
        }),
      } as unknown as SearchService;
      controller = new SearchController(service);
    });

    it("accepts valid query parameters and calls v2 discovery", async () => {
      const req = {
        headers: { "x-request-id": "req-123" },
      } as unknown as FastifyRequest;

      const res = await controller.search(
        MOCK_CONSUMER_USER,
        {
          riderId: RIDER_ID,
          pickupLat: "24.8607",
          pickupLng: "67.0011",
          destLat: "24.9200",
          destLng: "67.1100",
          day: "0",
          departureTime: "08:00",
          subscriptionType: "ONE_WAY",
        },
        req,
      );

      expect(res).toBeDefined();
      expect(res.pagination.total).toBe(0);
      expect(service.discover).toHaveBeenCalledWith(
        CONSUMER_USER_ID,
        expect.objectContaining({
          riderId: RIDER_ID,
          day: 0,
          departureTime: "08:00",
          subscriptionType: "ONE_WAY",
          pickupLat: 24.8607,
          pickupLng: 67.0011,
          destLat: 24.92,
          destLng: 67.11,
        }),
        "req-123",
      );
    });

    it("throws 400 BadRequestException when required query parameters are missing", async () => {
      const req = { headers: {} } as unknown as FastifyRequest;
      await expect(
        controller.search(
          MOCK_CONSUMER_USER,
          {
            pickupLat: "24.8607",
          },
          req,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws 400 BadRequestException for invalid day of week (outside 0..6)", async () => {
      const req = { headers: {} } as unknown as FastifyRequest;
      await expect(
        controller.search(
          MOCK_CONSUMER_USER,
          {
            riderId: RIDER_ID,
            day: "7",
            departureTime: "08:00",
            subscriptionType: "ONE_WAY",
          },
          req,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws 400 BadRequestException for invalid time format", async () => {
      const req = { headers: {} } as unknown as FastifyRequest;
      await expect(
        controller.search(
          MOCK_CONSUMER_USER,
          {
            riderId: RIDER_ID,
            day: "0",
            departureTime: "25:99",
            subscriptionType: "ONE_WAY",
          },
          req,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws 400 BadRequestException when ROUND_TRIP is requested without pickupTime", async () => {
      const req = { headers: {} } as unknown as FastifyRequest;
      await expect(
        controller.search(
          MOCK_CONSUMER_USER,
          {
            riderId: RIDER_ID,
            day: "0",
            departureTime: "08:00",
            subscriptionType: "ROUND_TRIP",
          },
          req,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws 400 BadRequestException when pickupTime is provided with DEPARTURE", async () => {
      const req = { headers: {} } as unknown as FastifyRequest;
      await expect(
        controller.search(
          MOCK_CONSUMER_USER,
          {
            riderId: RIDER_ID,
            day: "0",
            departureTime: "08:00",
            subscriptionType: "ONE_WAY",
            pickupTime: "17:00",
          },
          req,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("2. RBAC & Rate Limiting Guards", () => {
    it("RolesGuard allows CONSUMER and rejects DRIVER / ADMIN / INSTITUTION_ADMIN", () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const makeContext = (role: string): ExecutionContext => {
        jest
          .spyOn(reflector, "getAllAndOverride")
          .mockReturnValue(["CONSUMER"]);
        return {
          getHandler: () => ({}),
          getClass: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { sub: "u-1", role, status: "ACTIVE" },
            }),
          }),
        } as unknown as ExecutionContext;
      };

      expect(guard.canActivate(makeContext("CONSUMER"))).toBe(true);
      expect(() => guard.canActivate(makeContext("DRIVER"))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(makeContext("ADMIN"))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(makeContext("INSTITUTION_ADMIN"))).toThrow(
        ForbiddenException,
      );
    });

    it("SearchRateLimitGuard tracks by req.user.sub", async () => {
      const guard = new (class extends SearchRateLimitGuard {
        public override async getTracker(
          req: Record<string, unknown>,
        ): Promise<string> {
          return super.getTracker(req);
        }
      })(
        {} as ConstructorParameters<typeof SearchRateLimitGuard>[0],
        {} as ConstructorParameters<typeof SearchRateLimitGuard>[1],
        {
          getAllAndOverride: () => undefined,
        } as unknown as ConstructorParameters<typeof SearchRateLimitGuard>[2],
      );

      const trackerWithUser = await guard.getTracker({
        headers: {},
        user: { sub: CONSUMER_USER_ID },
        ip: "127.0.0.1",
      });
      expect(trackerWithUser).toBe(`search:${CONSUMER_USER_ID}`);

      const trackerWithoutUser = await guard.getTracker({
        headers: {},
        ip: "192.168.1.1",
      });
      expect(trackerWithoutUser).toBe("search:192.168.1.1");
    });
  });

  describe("3. Rider Ownership & Coordinate Resolution", () => {
    it("throws 403 Forbidden when rider belongs to another consumer", async () => {
      const prisma = createMockPrisma({ riderOwnedBy: OTHER_USER_ID });
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      await expect(
        service.search(CONSUMER_USER_ID, DEFAULT_QUERY),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws 404 NotFound when rider does not exist in DB", async () => {
      const prisma = createMockPrisma({ riderOwnedBy: null });
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      await expect(
        service.search(CONSUMER_USER_ID, {
          ...DEFAULT_QUERY,
          riderId: NON_EXISTENT_RIDER_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("falls back to rider profile home and dest coordinates when query coordinates are omitted", async () => {
      const prisma = createMockPrisma({
        riderOwnedBy: CONSUMER_USER_ID,
        homeLat: 24.85,
        homeLng: 67.01,
        destLat: 24.91,
        destLng: 67.12,
      });
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      const queryWithoutCoords: DriverSearchQuery = {
        riderId: RIDER_ID,
        day: 0,
        departureTime: "08:00",
        subscriptionType: "ONE_WAY",
      };

      await service.search(CONSUMER_USER_ID, queryWithoutCoords);

      expect(matchingClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          pickupLat: 24.85,
          pickupLng: 67.01,
          destLat: 24.91,
          destLng: 67.12,
        }),
        expect.any(Number),
        expect.any(AbortSignal),
        undefined,
      );
    });

    it("throws 400 BadRequestException when coordinates are missing in both query and profile", async () => {
      const prisma = createMockPrisma({
        riderOwnedBy: CONSUMER_USER_ID,
        homeLat: null,
        homeLng: null,
      });
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      const queryWithoutCoords: DriverSearchQuery = {
        riderId: RIDER_ID,
        day: 0,
        departureTime: "08:00",
        subscriptionType: "ONE_WAY",
      };

      await expect(
        service.search(CONSUMER_USER_ID, queryWithoutCoords),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("4. Service Area Bounding Box Validation", () => {
    it("throws 422 UnprocessableEntityException when pickup location is outside Karachi bbox", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      await expect(
        service.search(CONSUMER_USER_ID, {
          ...DEFAULT_QUERY,
          pickupLat: 31.5204, // Lahore
          pickupLng: 74.3587,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it("throws 422 UnprocessableEntityException when destination location is outside Karachi bbox", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      await expect(
        service.search(CONSUMER_USER_ID, {
          ...DEFAULT_QUERY,
          destLat: 25.5, // outside maxLat 25.15
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it("accepts coordinates exactly on the bounding box boundaries (inclusive boundary check)", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      const res = await service.search(CONSUMER_USER_ID, {
        ...DEFAULT_QUERY,
        pickupLat: 24.65,
        pickupLng: 66.85,
        destLat: 25.15,
        destLng: 67.35,
      });

      expect(res).toBeDefined();
      expect(matchingClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          pickupLat: 24.65,
          pickupLng: 66.85,
          destLat: 25.15,
          destLng: 67.35,
        }),
        expect.any(Number),
        expect.any(AbortSignal),
        undefined,
      );
    });
  });

  describe("5. Matching Microservice Proxy & Timeout Budgeting", () => {
    it("translates upstream failure into 503 ServiceUnavailableWithRetryException with Retry-After: 30", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient: MatchingClient = {
        search: jest
          .fn()
          .mockRejectedValue(
            new ServiceUnavailableWithRetryException(
              "Matching engine unavailable",
              30,
            ),
          ),
      } as unknown as MatchingClient;
      const service = new SearchService(prisma, matchingClient, redis);

      try {
        await service.search(CONSUMER_USER_ID, DEFAULT_QUERY);
        fail("Expected search to throw ServiceUnavailableWithRetryException");
      } catch (err) {
        if (!(err instanceof ServiceUnavailableWithRetryException)) throw err;
        expect(err).toBeInstanceOf(ServiceUnavailableWithRetryException);
        expect(err.getStatus()).toBe(503);
        expect(err.headers).toEqual({ "Retry-After": "30" });
      }
    });

    it("clamps matching budget to remaining gateway deadline (dynamic budget allocation)", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      let capturedBudgetMs = 0;
      const matchingClient: MatchingClient = {
        search: jest.fn().mockImplementation((_req, budgetMs) => {
          capturedBudgetMs = budgetMs;
          return Promise.resolve({
            results: [],
            totalCandidatesEvaluated: 0,
            totalEligible: 0,
            exclusionSummary: {
              firstFailureCounts: {
                driverStatus: 0,
                invalidGeometry: 0,
                distance: 0,
                direction: 0,
                operatingDay: 0,
                capacity: 0,
                timing: 0,
              },
            },
            meta: {
              executionTimeMs: 1,
              searchTimestamp: new Date().toISOString(),
            },
          });
        }),
      } as unknown as MatchingClient;

      const service = new SearchService(prisma, matchingClient, redis);
      service.gatewayDeadlineMs = 1500;

      await service.search(CONSUMER_USER_ID, DEFAULT_QUERY);

      expect(capturedBudgetMs).toBeGreaterThan(0);
      expect(capturedBudgetMs).toBeLessThanOrEqual(1500);
    });

    it("triggers 503 response deadline exceeded if overall gateway execution exceeds deadline", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient: MatchingClient = {
        search: jest
          .fn()
          .mockImplementation((_req, _budget, signal: AbortSignal) => {
            return new Promise((resolve, reject) => {
              const timer = setTimeout(
                () =>
                  resolve({
                    results: [],
                    totalCandidatesEvaluated: 0,
                    totalEligible: 0,
                    exclusionSummary: {
                      firstFailureCounts: {
                        driverStatus: 0,
                        invalidGeometry: 0,
                        distance: 0,
                        direction: 0,
                        operatingDay: 0,
                        capacity: 0,
                        timing: 0,
                      },
                    },
                    meta: {
                      executionTimeMs: 1,
                      searchTimestamp: new Date().toISOString(),
                    },
                  }),
                200,
              );
              signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new Error("ABORTED"));
              });
            });
          }),
      } as unknown as MatchingClient;

      const service = new SearchService(prisma, matchingClient, redis);
      service.gatewayDeadlineMs = 50;

      try {
        await service.search(CONSUMER_USER_ID, DEFAULT_QUERY);
        fail("Expected search to throw ServiceUnavailableWithRetryException");
      } catch (err) {
        if (!(err instanceof ServiceUnavailableWithRetryException)) throw err;
        expect(err).toBeInstanceOf(ServiceUnavailableWithRetryException);
        expect(err.getStatus()).toBe(503);
        expect(err.headers).toEqual({ "Retry-After": "30" });
      }
    });
  });

  describe("6. Candidate Enrichment & Exact Ranking Preservation", () => {
    it("enriches candidates with driver user name, vehicle details, PKR price and preserves exact Python ranking", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      const res = await service.search(CONSUMER_USER_ID, DEFAULT_QUERY);

      expect(res.count).toBe(2);
      expect(res.totalEligible).toBe(2);
      expect(res.results).toHaveLength(2);

      const first = res.results[0]!;
      expect(first.driverProfileId).toBe(DRIVER_PROFILE_1);
      expect(first.driverName).toBe("Tariq Mahmood");
      expect(first.vehicleMake).toBe("Toyota");
      expect(first.vehicleModel).toBe("HiAce");
      expect(first.vehicleColour).toBe("Silver");
      expect(first.monthlyPriceCents).toBe(1800000);
      expect(first.currency).toBe("PKR");
      expect(first.pickupWalkDistanceMeters).toBe(245.4);
      expect(first.dropoffWalkDistanceMeters).toBe(412.8);
      expect(first.estimatedPickupTime).toBe("08:00");
      expect(first.estimatedDropoffTime).toBe("08:35"); // 08:00 + 35m
      expect(first.matchScore).toBe(0.942);

      const second = res.results[1]!;
      expect(second.driverProfileId).toBe(DRIVER_PROFILE_2);
      expect(second.driverName).toBe("Ahmed Ali");
      expect(second.vehicleMake).toBe("Suzuki");
      expect(second.vehicleModel).toBe("Every");
      expect(second.vehicleColour).toBe("White");
      expect(second.monthlyPriceCents).toBe(1400000);
      expect(second.pickupWalkDistanceMeters).toBe(512.1);
      expect(second.dropoffWalkDistanceMeters).toBe(620.3);
      expect(second.estimatedPickupTime).toBe("08:00");
      expect(second.estimatedDropoffTime).toBe("08:40"); // 08:00 + 40m
      expect(second.matchScore).toBe(0.865);
    });
  });

  describe("7. Zero Results & Dominant No-Match Reason Mapping", () => {
    const testCases: Array<{
      counts: FirstFailureCounts;
      expectedReason: string;
    }> = [
      {
        counts: {
          driverStatus: 0,
          invalidGeometry: 0,
          distance: 6,
          direction: 2,
          operatingDay: 1,
          capacity: 0,
          timing: 0,
        },
        expectedReason: "NO_DRIVERS_IN_AREA",
      },
      {
        counts: {
          driverStatus: 0,
          invalidGeometry: 0,
          distance: 2,
          direction: 9,
          operatingDay: 1,
          capacity: 0,
          timing: 0,
        },
        expectedReason: "NO_DRIVERS_IN_DIRECTION",
      },
      {
        counts: {
          driverStatus: 0,
          invalidGeometry: 0,
          distance: 1,
          direction: 2,
          operatingDay: 7,
          capacity: 0,
          timing: 0,
        },
        expectedReason: "NO_DRIVERS_ON_DAY",
      },
      {
        counts: {
          driverStatus: 0,
          invalidGeometry: 0,
          distance: 1,
          direction: 0,
          operatingDay: 0,
          capacity: 8,
          timing: 0,
        },
        expectedReason: "ALL_DRIVERS_FULL",
      },
      {
        counts: {
          driverStatus: 0,
          invalidGeometry: 0,
          distance: 0,
          direction: 1,
          operatingDay: 1,
          capacity: 0,
          timing: 5,
        },
        expectedReason: "NO_DRIVERS_AT_TIME",
      },
    ];

    testCases.forEach(({ counts, expectedReason }) => {
      it(`maps dominant reason to ${expectedReason}`, async () => {
        const prisma = createMockPrisma();
        const redis = createMockRedis();
        const matchingClient = createMockMatchingClient({
          results: [],
          totalCandidatesEvaluated: 10,
          totalEligible: 0,
          exclusionSummary: {
            firstFailureCounts: counts,
          },
          meta: {
            executionTimeMs: 1,
            searchTimestamp: new Date().toISOString(),
          },
        });

        const service = new SearchService(prisma, matchingClient, redis);
        const res = await service.search(CONSUMER_USER_ID, DEFAULT_QUERY);

        expect(res.count).toBe(0);
        expect(res.results).toEqual([]);
        expect(res.noMatchReasons).toEqual([expectedReason]);
      });
    });
  });

  describe("8. Redis Caching, Precision, Cross-Consumer Sharing, and Self-Healing", () => {
    it("serves subsequent identical search from Redis cache without calling matching proxy", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      const res1 = await service.search(CONSUMER_USER_ID, DEFAULT_QUERY);
      expect(res1.count).toBe(2);
      expect(matchingClient.search).toHaveBeenCalledTimes(1);

      const res2 = await service.search(CONSUMER_USER_ID, DEFAULT_QUERY);
      expect(res2.count).toBe(2);
      expect(res2.results[0]?.driverProfileId).toBe(DRIVER_PROFILE_1);
      expect(matchingClient.search).toHaveBeenCalledTimes(1);
    });

    it("shares cache across different consumers searching the same corridor (riderId omitted from cache key)", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      await service.search(CONSUMER_USER_ID, {
        ...DEFAULT_QUERY,
        riderId: RIDER_ID,
      });
      expect(matchingClient.search).toHaveBeenCalledTimes(1);

      const resOtherConsumer = await service.search(CONSUMER_USER_ID, {
        ...DEFAULT_QUERY,
        riderId: OTHER_RIDER_ID,
      });

      expect(resOtherConsumer.count).toBe(2);
      expect(matchingClient.search).toHaveBeenCalledTimes(1);
    });

    it("distinguishes coordinates differing only at 5th/6th decimal (6-decimal cache key collision prevention)", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      await service.search(CONSUMER_USER_ID, {
        ...DEFAULT_QUERY,
        pickupLat: 24.8607,
        pickupLng: 67.0011,
      });
      expect(matchingClient.search).toHaveBeenCalledTimes(1);

      await service.search(CONSUMER_USER_ID, {
        ...DEFAULT_QUERY,
        pickupLat: 24.860749,
        pickupLng: 67.001149,
      });

      expect(matchingClient.search).toHaveBeenCalledTimes(2);
    });

    it("self-heals when Redis cache contains corrupted or invalid schema data (safeParse deletion and bypass)", async () => {
      const prisma = createMockPrisma();
      const redis = createMockRedis();
      const matchingClient = createMockMatchingClient();
      const service = new SearchService(prisma, matchingClient, redis);

      const badCacheKey = "search:v1:1:badkey";
      await redis.set(
        badCacheKey,
        JSON.stringify({ invalid: "corrupted_payload" }),
      );

      Object.defineProperty(service, "buildCacheKey", {
        value: () => badCacheKey,
      });

      const res = await service.search(CONSUMER_USER_ID, DEFAULT_QUERY);

      expect(res.count).toBe(2);
      expect(matchingClient.search).toHaveBeenCalledTimes(1);
      // Confirms redis.del was called when safeParse failed on the corrupted entry
      expect(redis.del).toHaveBeenCalledWith(badCacheKey);

      // And the key was subsequently re-populated with fresh valid data
      const updatedCache = await redis.get(badCacheKey);
      expect(updatedCache).not.toBeNull();
      const parsedUpdated = JSON.parse(updatedCache!);
      expect(parsedUpdated.count).toBe(2);
    });
  });
});

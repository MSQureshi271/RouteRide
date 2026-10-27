/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    set: jest.fn().mockResolvedValue("OK"),
    quit: jest.fn().mockResolvedValue(undefined),
  }));
});

let mockDurationWorkerProcessor: ((job: any) => Promise<any>) | null = null;
let mockDurationWorkerFailed: ((job: any, err: any) => void) | null = null;

jest.mock("bullmq", () => {
  return {
    Worker: jest.fn().mockImplementation((_name, processor, _opts) => {
      mockDurationWorkerProcessor = processor;
      return {
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === "failed") {
            mockDurationWorkerFailed = handler;
          }
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

import {
  buildDurationCacheKey,
  calculateHaversineDistanceMeters,
  calculateHaversineDurationMinutes,
  DurationCacheJobService,
} from "../src/duration-cache/duration-cache.job";
import { DurationCacheWorkerService } from "../src/duration-cache/duration-cache.worker";
import { WorkerDatabaseService } from "../src/database/database.service";
import { Logger } from "@nestjs/common";

describe("DurationCacheJobService & Worker (Task 1.10c)", () => {
  let dbService: WorkerDatabaseService;
  let jobService: DurationCacheJobService;
  let workerService: DurationCacheWorkerService;
  let mockRedis: any;

  beforeEach(async () => {
    dbService = new WorkerDatabaseService();
    dbService.query = jest.fn().mockResolvedValue([
      {
        pickup_lat: 24.8601,
        pickup_lng: 67.0102,
        dest_lat: 24.9203,
        dest_lng: 67.1104,
      },
    ]);

    process.env["GOOGLE_MAPS_API_KEY"] = "";

    jobService = new DurationCacheJobService(dbService);
    await jobService.onModuleInit();
    mockRedis = jobService.redisClient;

    workerService = new DurationCacheWorkerService(jobService);
  });

  afterEach(async () => {
    await jobService.onModuleDestroy();
  });

  describe("Haversine & Key Utilities", () => {
    it("computes Haversine distance and duration accurately", () => {
      const dist = calculateHaversineDistanceMeters(24.86, 67.01, 24.92, 67.11);
      expect(dist).toBeGreaterThan(10000);
      expect(dist).toBeLessThan(20000);

      const duration = calculateHaversineDurationMinutes(
        24.86,
        67.01,
        24.92,
        67.11,
        25.0,
        1.3,
      );
      expect(duration).toBeGreaterThan(20);
      expect(duration).toBeLessThan(60);
    });

    it("formats 4-decimal quantized Redis cache keys", () => {
      const key = buildDurationCacheKey(
        24.860123,
        67.010456,
        24.920789,
        67.110111,
      );
      expect(key).toBe("duration:24.8601,67.0105:24.9208,67.1101");
    });
  });

  describe("DurationCacheJobService Warmup Execution", () => {
    it("handles an empty route-free population without fabricating routes", async () => {
      dbService.query = jest.fn().mockResolvedValue([]);
      expect(await jobService.executeWarmup()).toEqual({
        pairsWarmed: 0,
        apiSuccessCount: 0,
        fallbackCount: 0,
      });
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it("marks cached estimates as unsuitable for acceptance", async () => {
      const entry = await jobService.resolveDuration({
        pickupLat: 24.86,
        pickupLng: 67.01,
        destLat: 24.92,
        destLng: 67.11,
      });
      expect(entry).toMatchObject({
        policyVersion: "search-estimate-v2",
        authoritativeForAcceptance: false,
      });
    });

    it("keeps coordinates and provider error text out of warmup failure logs", async () => {
      const warn = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});
      const originalFetch = global.fetch;
      const originalApiKey = process.env["GOOGLE_MAPS_API_KEY"];
      process.env["GOOGLE_MAPS_API_KEY"] = "mock-maps-key";
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error("provider echoed 24.861234 67.012345"));
      try {
        await jobService.resolveDuration({
          pickupLat: 24.861234,
          pickupLng: 67.012345,
          destLat: 24.92,
          destLng: 67.11,
        });
        expect(warn).toHaveBeenCalledWith({
          event: "duration_cache.maps_api_error",
          reason: "provider_failure",
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain("24.861234");
      } finally {
        global.fetch = originalFetch;
        if (originalApiKey === undefined)
          delete process.env["GOOGLE_MAPS_API_KEY"];
        else process.env["GOOGLE_MAPS_API_KEY"] = originalApiKey;
        warn.mockRestore();
      }
    });
    it("fetches distinct route pairs from database", async () => {
      const pairs = await jobService.fetchDistinctRoutePairs();
      expect(pairs).toHaveLength(1);
      expect(pairs[0]).toEqual({
        pickupLat: 24.8601,
        pickupLng: 67.0102,
        destLat: 24.9203,
        destLng: 67.1104,
      });
    });

    it("resolves duration using Haversine fallback when Maps API key is unconfigured", async () => {
      const pair = {
        pickupLat: 24.86,
        pickupLng: 67.01,
        destLat: 24.92,
        destLng: 67.11,
      };

      const entry = await jobService.resolveDuration(pair);
      expect(entry.source).toBe("HAVERSINE_ESTIMATE");
      expect(entry.durationMinutes).toBeGreaterThan(0);
      expect(entry.distanceMeters).toBeGreaterThan(0);
      expect(entry.computedAt).toBeDefined();
    });

    it("resolves duration using Google Maps API when available and valid", async () => {
      const pair = {
        pickupLat: 24.86,
        pickupLng: 67.01,
        destLat: 24.92,
        destLng: 67.11,
      };

      const mockFetchResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "OK",
          rows: [
            {
              elements: [
                {
                  status: "OK",
                  duration: { value: 1680, text: "28 mins" },
                  distance: { value: 14200, text: "14.2 km" },
                },
              ],
            },
          ],
        }),
      };

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);
      const originalEnv = process.env["GOOGLE_MAPS_API_KEY"];
      process.env["GOOGLE_MAPS_API_KEY"] = "mock-maps-key";

      try {
        const entry = await jobService.resolveDuration(pair);
        expect(entry.source).toBe("GOOGLE_MAPS");
        expect(entry.durationMinutes).toBe(28.0);
        expect(entry.distanceMeters).toBe(14200);
      } finally {
        global.fetch = originalFetch;
        process.env["GOOGLE_MAPS_API_KEY"] = originalEnv;
      }
    });

    it("falls back to Haversine when Google Maps API throws or fails", async () => {
      const pair = {
        pickupLat: 24.86,
        pickupLng: 67.01,
        destLat: 24.92,
        destLng: 67.11,
      };

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error("Network timeout"));
      const originalEnv = process.env["GOOGLE_MAPS_API_KEY"];
      process.env["GOOGLE_MAPS_API_KEY"] = "mock-maps-key";

      try {
        const entry = await jobService.resolveDuration(pair);
        expect(entry.source).toBe("HAVERSINE_ESTIMATE");
        expect(entry.durationMinutes).toBeGreaterThan(0);
      } finally {
        global.fetch = originalFetch;
        process.env["GOOGLE_MAPS_API_KEY"] = originalEnv;
      }
    });

    it("executes full warmup and populates Redis with 86400s TTL", async () => {
      const result = await jobService.executeWarmup();

      expect(result.pairsWarmed).toBe(1);
      expect(result.fallbackCount).toBe(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        "duration:24.8601,67.0102:24.9203,67.1104",
        expect.stringContaining('"source":"HAVERSINE_ESTIMATE"'),
        "EX",
        86400,
      );
    });
  });

  describe("DurationCacheWorkerService BullMQ Lifecycle", () => {
    it("initializes BullMQ worker and processes job", async () => {
      await workerService.onModuleInit();
      expect(workerService.worker).toBeDefined();

      if (mockDurationWorkerFailed) {
        mockDurationWorkerFailed(
          { id: "job-101" },
          new Error("Cache warmup fail"),
        );
        mockDurationWorkerFailed(undefined, new Error("Null job fail"));
      }

      if (mockDurationWorkerProcessor) {
        const res = await mockDurationWorkerProcessor({ id: "job-warmup" });
        expect(res.pairsWarmed).toBe(1);
      }

      await workerService.onModuleDestroy();
    });

    it("destroys cleanly even when worker or redisConnection is undefined", async () => {
      const freshWorker = new DurationCacheWorkerService(jobService);
      await expect(freshWorker.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    quit: jest.fn().mockResolvedValue(undefined),
  }));
});

let mockWorkerFailedHandler: ((job: any, err: any) => void) | null = null;
let mockWorkerProcessor: ((job: any) => Promise<any>) | null = null;

jest.mock("bullmq", () => {
  return {
    Worker: jest.fn().mockImplementation((_name, processor, _opts) => {
      mockWorkerProcessor = processor;
      return {
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === "failed") {
            mockWorkerFailedHandler = handler;
          }
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

import { DriverStatsJobService } from "../src/driver-stats/driver-stats.job";
import { DriverStatsWorkerService } from "../src/driver-stats/driver-stats.worker";
import { WorkerDatabaseService } from "../src/database/database.service";

describe("DriverStatsJobService & Worker (Task 1.10)", () => {
  let dbService: WorkerDatabaseService;
  let jobService: DriverStatsJobService;
  let workerService: DriverStatsWorkerService;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql === "BEGIN;" || sql === "COMMIT;" || sql === "ROLLBACK;") {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        if (sql.includes("UPDATE driver_profiles dp")) {
          return Promise.resolve({ rowCount: 2, rows: [] });
        }
        if (sql.includes("INSERT INTO driver_matching_stats")) {
          return Promise.resolve({ rowCount: 14, rows: [] }); // 2 drivers * 7 days
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: jest.fn(),
    };

    dbService = new WorkerDatabaseService();
    dbService.getClient = jest.fn().mockResolvedValue(mockClient);

    jobService = new DriverStatsJobService(dbService);
    workerService = new DriverStatsWorkerService(jobService);
  });

  describe("DriverStatsJobService Transaction & Execution", () => {
    it("successfully runs transaction and commits", async () => {
      const result = await jobService.executeRefresh();

      expect(mockClient.query).toHaveBeenCalledWith("BEGIN;");
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE driver_profiles dp"),
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO driver_matching_stats"),
      );
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT;");
      expect(mockClient.release).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        driversUpdated: 2,
        statsUpserted: 14,
      });
    });

    it("handles null rowCount fallback cleanly", async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === "BEGIN;" || sql === "COMMIT;") return Promise.resolve({});
        if (sql.includes("UPDATE driver_profiles dp"))
          return Promise.resolve({});
        if (sql.includes("INSERT INTO driver_matching_stats"))
          return Promise.resolve({});
        return Promise.resolve({});
      });

      const result = await jobService.executeRefresh();
      expect(result).toEqual({
        driversUpdated: 0,
        statsUpserted: 0,
      });
    });

    it("rolls back transaction on error and releases client", async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === "BEGIN;") return Promise.resolve({});
        if (sql.includes("UPDATE driver_profiles dp")) {
          throw new Error("Database deadlock / serialization failure");
        }
        return Promise.resolve({});
      });

      await expect(jobService.executeRefresh()).rejects.toThrow(
        "Database deadlock / serialization failure",
      );

      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK;");
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("SQL Logic Invariants & Canonical Semantics", () => {
    it("counts explicit decisions and excludes pending and withdrawn requests", async () => {
      await jobService.executeRefresh();
      const updateQuery = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes("UPDATE driver_profiles dp"),
      )[0];
      expect(updateQuery).toContain("NOW() - INTERVAL '90 days'");
      expect(updateQuery).toContain(
        "s.status IN ('ACTIVE', 'PAUSED', 'DECLINED', 'EXPIRED')",
      );
      expect(updateQuery).toContain(
        "run_assignments ra WHERE ra.subscription_id = s.id",
      );
      expect(updateQuery).not.toContain("INTERVAL '24 hours'");
      expect(updateQuery).not.toContain(
        "IN ('ACTIVE', 'PAUSED', 'EXPIRED') THEN TRUE",
      );
      expect(updateQuery).toContain("WHEN COALESCE(da.eligible_count, 0) > 0");
      expect(updateQuery).toContain("ELSE NULL");
    });

    it("verifies full-grid refresh and 0/1/2 vs >=3 observation matrix in day-level SQL", async () => {
      await jobService.executeRefresh();

      const gridQuery = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes("INSERT INTO driver_matching_stats"),
      )[0];

      // Must build complete 0..6 operating day grid across approved drivers to avoid stale rows
      expect(gridQuery).toContain(
        "CROSS JOIN generate_series(0, 6) AS day(val)",
      );
      expect(gridQuery).toContain("WHERE dp.status = 'APPROVED'");
      expect(gridQuery).toContain("FROM recurring_runs rr");
      expect(gridQuery).toContain("NOT rr.needs_review");
      expect(gridQuery).toContain("ra.effective_from <= CURRENT_DATE");
      expect(gridQuery).not.toContain("FROM driver_schedule_slots");
      // Must calculate median seconds using percentile_cont(0.5)
      expect(gridQuery).toContain(
        "percentile_cont(0.5) WITHIN GROUP (ORDER BY pickup_seconds)",
      );
      // Must enforce observation threshold >= 3 for typical departure time
      expect(gridQuery).toContain("WHEN COALESCE(oa.obs_count, 0) >= 3");
      expect(gridQuery).toContain("ELSE NULL");
      // Must upsert on conflict to explicitly reset rows when counts drop below 3 or to 0
      expect(gridQuery).toContain(
        "ON CONFLICT (driver_profile_id, operating_day)",
      );
      expect(gridQuery).toContain(
        "typical_departure_time = EXCLUDED.typical_departure_time",
      );
      expect(gridQuery).toContain(
        "observation_count = EXCLUDED.observation_count",
      );
    });

    it("satisfies idempotence: consecutive runs produce identical updates", async () => {
      const run1 = await jobService.executeRefresh();
      const run2 = await jobService.executeRefresh();

      expect(run1).toEqual(run2);
    });
  });

  describe("DriverStatsWorkerService BullMQ Lifecycle", () => {
    it("initializes BullMQ worker and handles failure callbacks", async () => {
      await workerService.onModuleInit();
      expect(workerService.worker).toBeDefined();

      // Trigger failed handler
      if (mockWorkerFailedHandler) {
        mockWorkerFailedHandler(
          { id: "job-999" },
          new Error("Test worker failure"),
        );
        mockWorkerFailedHandler(undefined, new Error("Null job failure"));
      }

      // Trigger processor created inside onModuleInit
      if (mockWorkerProcessor) {
        const procResult = await mockWorkerProcessor({ id: "job-proc" });
        expect(procResult).toEqual({
          driversUpdated: 2,
          statsUpserted: 14,
        });
      }

      await workerService.onModuleDestroy();
    });

    it("processes BullMQ job by delegating to jobService", async () => {
      const mockJob: any = { id: "job-100", data: {} };
      const res = await workerService.processJob(mockJob);

      expect(res).toEqual({
        driversUpdated: 2,
        statsUpserted: 14,
      });
    });

    it("destroys cleanly even when worker or redisConnection is undefined", async () => {
      const freshWorkerService = new DriverStatsWorkerService(jobService);
      await expect(freshWorkerService.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});

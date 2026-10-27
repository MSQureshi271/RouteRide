/**
 * BullMQ Driver Stats Worker (Phase 1A Task 1.10).
 *
 * Consumes the 'driver-stats' queue and executes the daily authoritative
 * precompute refresh for driver acceptance statistics and median departure times.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Job, Worker } from "bullmq";
import Redis from "ioredis";
import { DriverStatsJobService } from "./driver-stats.job";

export const DRIVER_STATS_QUEUE_NAME = "driver-stats";

@Injectable()
export class DriverStatsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriverStatsWorkerService.name);
  public worker?: Worker;
  private redisConnection?: Redis;

  constructor(private readonly statsJobService: DriverStatsJobService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env["REDIS_URL"] || "redis://localhost:6379";
    this.redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.worker = new Worker(
      DRIVER_STATS_QUEUE_NAME,
      async (job: Job) => {
        return this.processJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency: 1, // Single concurrency to prevent concurrent table lock conflicts
      },
    );

    this.worker.on("failed", (job, _err) => {
      this.logger.error({
        event: "driver_stats_worker.job_failed",
        jobId: job?.id,
        reason: "job_failure",
      });
    });

    this.logger.log({ event: "driver_stats_worker.initialized" });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.redisConnection) {
      await this.redisConnection.quit();
    }
  }

  async processJob(
    _job: Job,
  ): Promise<{ driversUpdated: number; statsUpserted: number }> {
    this.logger.log({ event: "driver_stats_worker.job_started" });
    const result = await this.statsJobService.executeRefresh();
    this.logger.log({
      event: "driver_stats_worker.job_completed",
      ...result,
    });
    return result;
  }
}

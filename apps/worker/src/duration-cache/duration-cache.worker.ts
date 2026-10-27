/**
 * BullMQ Duration Cache Worker (Phase 1A Task 1.10c).
 *
 * Consumes the 'duration-cache' queue and executes the daily off-peak
 * duration precomputation into Redis.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Job, Worker } from "bullmq";
import Redis from "ioredis";
import {
  DurationCacheJobService,
  DurationWarmupResult,
} from "./duration-cache.job";

export const DURATION_CACHE_QUEUE_NAME = "duration-cache";

@Injectable()
export class DurationCacheWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DurationCacheWorkerService.name);
  public worker?: Worker;
  private redisConnection?: Redis;

  constructor(private readonly durationJobService: DurationCacheJobService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env["REDIS_URL"] || "redis://localhost:6379";
    this.redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.worker = new Worker(
      DURATION_CACHE_QUEUE_NAME,
      async (job: Job) => {
        return this.processJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency: 1,
      },
    );

    this.worker.on("failed", (job, _err) => {
      this.logger.error({
        event: "duration_cache_worker.job_failed",
        jobId: job?.id,
        reason: "job_failure",
      });
    });

    this.logger.log({ event: "duration_cache_worker.initialized" });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.redisConnection) {
      await this.redisConnection.quit();
    }
  }

  async processJob(_job: Job): Promise<DurationWarmupResult> {
    this.logger.log({ event: "duration_cache_worker.job_started" });
    const result = await this.durationJobService.executeWarmup();
    this.logger.log({
      event: "duration_cache_worker.job_completed",
      ...result,
    });
    return result;
  }
}

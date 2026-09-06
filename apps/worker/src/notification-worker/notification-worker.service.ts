/**
 * BullMQ notification worker processor.
 *
 * Consumes the 'notifications' queue from Redis.
 * Routes each job to the appropriate delivery channels (FCM, Email, SMS).
 * Handles token invalidation and failure recovery gracefully.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Job, Worker } from "bullmq";
import Redis from "ioredis";
import { FcmAdapter, StaleTokenError } from "./adapters/fcm.adapter";
import { SendgridAdapter } from "./adapters/sendgrid.adapter";
import { DevSmsAdapter } from "./adapters/sms-channel.interface";
import type { DeliveryPayload } from "./adapters/notification-channel.interface";
import { WorkerDatabaseService } from "../database/database.service";

export const NOTIFICATION_QUEUE_NAME = "notifications";

@Injectable()
export class NotificationWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationWorkerService.name);
  private worker?: Worker;
  private redisConnection?: Redis;

  constructor(
    private readonly fcmAdapter: FcmAdapter,
    private readonly sendgridAdapter: SendgridAdapter,
    private readonly smsAdapter: DevSmsAdapter,
    private readonly dbService: WorkerDatabaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env["REDIS_URL"] || "redis://localhost:6379";
    this.redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.worker = new Worker<DeliveryPayload>(
      NOTIFICATION_QUEUE_NAME,
      async (job: Job<DeliveryPayload>) => {
        return this.processJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency: 10,
        limiter: {
          max: 100,
          duration: 1000,
        },
      },
    );

    this.worker.on("completed", (job) => {
      this.logger.debug(`Job ${job.id} completed for user ${job.data.userId}`);
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error(
        `Job ${job?.id} failed for user ${job?.data?.userId}: ${err.message}`,
        err.stack,
      );
    });

    this.logger.log(
      `Notification worker started on queue [${NOTIFICATION_QUEUE_NAME}]`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.redisConnection) {
      await this.redisConnection.quit();
    }
    this.logger.log("Notification worker stopped");
  }

  /**
   * Process an individual delivery job.
   */
  async processJob(job: Job<DeliveryPayload>): Promise<void> {
    const payload = job.data;
    const errors: Error[] = [];

    // 1. Push delivery via FCM
    if (payload.fcmToken) {
      try {
        await this.fcmAdapter.send(payload);
      } catch (err) {
        if (err instanceof StaleTokenError) {
          this.logger.warn(
            `Clearing invalid FCM token for user ${payload.userId}`,
          );
          await this.dbService.clearUserFcmToken(payload.userId);
        } else {
          errors.push(err as Error);
        }
      }
    }

    // 2. Email delivery if provided and relevant
    if (payload.email && this.isEmailEligible(payload.type)) {
      try {
        await this.sendgridAdapter.send(payload);
      } catch (err) {
        errors.push(err as Error);
      }
    }

    // 3. SMS delivery if phone provided and type requires SMS
    if (payload.phone && this.isSmsEligible(payload.type)) {
      try {
        await this.smsAdapter.send(payload);
      } catch (err) {
        errors.push(err as Error);
      }
    }

    if (errors.length > 0) {
      // If any delivery channel errored, throw so BullMQ can retry
      throw new Error(
        `Delivery error for job ${job.id}: ${errors.map((e) => e.message).join("; ")}`,
      );
    }
  }

  private isEmailEligible(type: string): boolean {
    const emailTypes = [
      "SUBSCRIPTION_CONFIRMED",
      "PAYMENT_RECEIPT",
      "ACCOUNT_SECURITY_ALERT",
      "SUBSCRIPTION_CANCELLED",
    ];
    return emailTypes.includes(type);
  }

  private isSmsEligible(type: string): boolean {
    const smsTypes = [
      "TRIP_CRITICAL_DELAY",
      "TRIP_CANCELLED",
      "DRIVER_EMERGENCY",
    ];
    return smsTypes.includes(type);
  }
}

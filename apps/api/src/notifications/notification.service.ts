/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * NotificationService — manages notification persistence, deduplication, and BullMQ enqueueing.
 *
 * Architecture:
 *  - API owns persistence into `notifications` table and queue enqueueing.
 *  - Worker microservice owns actual multi-channel delivery (FCM, Email, SMS).
 *  - Deduplication uses Redis with a 1-hour sliding TTL window.
 *  - In-app notification records are persisted BEFORE enqueueing so records
 *    survive even if queue enqueueing or delivery fails.
 */
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Queue } from "bullmq";
import { createHash } from "node:crypto";
import type Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service.js";

export interface EnqueueNotificationDto {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private queue!: Queue;

  constructor(
    private readonly prisma: PrismaService,
    @Inject("REDIS_CLIENT") private readonly redis: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue = new Queue("notifications", {
      connection: this.redis as any,
    });
    this.logger.log("Notification queue initialized");
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
    }
  }

  /**
   * Compute SHA-256 deduplication key based on (userId, type, entityId, date).
   */
  private computeDedupKey(
    userId: string,
    type: string,
    entityId: string,
  ): string {
    const today = new Date().toISOString().slice(0, 10);
    return createHash("sha256")
      .update(`${userId}:${type}:${entityId}:${today}`)
      .digest("hex");
  }

  /**
   * Enqueue a notification for delivery.
   * Checks deduplication in Redis, saves in DB, and pushes to BullMQ.
   */
  async enqueue(
    userId: string,
    type: string,
    entityId: string,
    dto: EnqueueNotificationDto,
  ): Promise<NotificationRecord | null> {
    const dedupHash = this.computeDedupKey(userId, type, entityId);
    const dedupKey = `notif:dedup:${dedupHash}`;

    // Deduplication check: Set key with 1-hour expiration if not exists
    const setSuccess = await this.redis.set(dedupKey, "1", "EX", 3600, "NX");
    if (!setSuccess) {
      this.logger.debug(
        `Duplicate notification suppressed: ${type} for user ${userId} (entity: ${entityId})`,
      );
      return null;
    }

    // 1. Persist notification in database first so it exists regardless of delivery success
    const rows = await this.prisma.query<any>(
      `INSERT INTO notifications (user_id, type, title, body, data, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
       RETURNING id, user_id as "userId", type, title, body, data, is_read as "isRead", created_at as "createdAt"`,
      [userId, type, dto.title, dto.body, JSON.stringify(dto.data || {})],
    );
    const savedRecord = rows[0];

    // Invalidate unread cache
    await this.redis.del(`notif:unread:${userId}`);

    // 2. Lookup recipient's contact channels
    const userRows = await this.prisma.query<{
      fcm_token: string | null;
      email: string | null;
      phone: string | null;
    }>(`SELECT fcm_token, email, phone FROM users WHERE id = $1`, [userId]);
    const user = userRows[0];

    // 3. Enqueue to BullMQ for Worker processing
    try {
      await this.queue.add(
        "deliver",
        {
          userId,
          notificationId: savedRecord.id,
          type,
          title: dto.title,
          body: dto.body,
          data: dto.data
            ? Object.fromEntries(
                Object.entries(dto.data).map(([k, v]) => [k, String(v)]),
              )
            : {},
          fcmToken: user?.fcm_token,
          email: user?.email,
          phone: user?.phone,
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          removeOnComplete: true,
        },
      );
    } catch (queueErr) {
      // In-app notification record is still saved in DB even if queue is temporarily unreachable
      this.logger.error(
        `Failed to enqueue notification to BullMQ: ${(queueErr as Error).message}`,
      );
    }

    return savedRecord;
  }

  /**
   * List paginated notifications for the authenticated user.
   */
  async listForUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    data: NotificationRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      this.prisma.query<any>(
        `SELECT id, user_id as "userId", type, title, body, data, is_read as "isRead", created_at as "createdAt"
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
      this.prisma.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM notifications WHERE user_id = $1`,
        [userId],
      ),
    ]);

    const total = parseInt(countRows[0]?.count || "0", 10);
    return { data: rows, total, page, limit };
  }

  /**
   * Mark a notification as read with ownership validation.
   */
  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationRecord> {
    const rows = await this.prisma.query<any>(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id as "userId", type, title, body, data, is_read as "isRead", created_at as "createdAt"`,
      [notificationId, userId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        `Notification ${notificationId} not found or does not belong to user`,
      );
    }

    // Invalidate unread cache
    await this.redis.del(`notif:unread:${userId}`);

    return rows[0];
  }

  /**
   * Get unread notification count, cached for 10 seconds in Redis.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `notif:unread:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return parseInt(cached, 10);
    }

    const rows = await this.prisma.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    );

    const count = parseInt(rows[0]?.count || "0", 10);
    await this.redis.set(cacheKey, count.toString(), "EX", 10);
    return count;
  }

  /**
   * Register or update the user's FCM device token.
   */
  async registerFcmToken(userId: string, token: string): Promise<void> {
    await this.prisma.query(
      `UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2`,
      [token, userId],
    );
    this.logger.debug(`Registered FCM token for user ${userId}`);
  }

  /**
   * Clear the user's FCM token (e.g. on logout).
   */
  async clearFcmToken(userId: string): Promise<void> {
    await this.prisma.query(
      `UPDATE users SET fcm_token = NULL, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
    this.logger.debug(`Cleared FCM token for user ${userId}`);
  }
}

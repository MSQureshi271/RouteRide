/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * notifications.integration.test.ts
 *
 * Tests for notification persistence, deduplication, BullMQ enqueueing, and in-app centre (T0.35).
 */

import { NotificationService } from "../src/notifications/notification.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

describe("NotificationService & In-App Centre (T0.35)", () => {
  let service: NotificationService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockQueue: any;
  let storedNotifications: any[] = [];
  let redisStore: Map<string, string>;

  beforeEach(async () => {
    storedNotifications = [];
    redisStore = new Map();

    mockRedis = {
      get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
      set: jest.fn(async (key: string, val: string, ...args: any[]) => {
        if (args.includes("NX") && redisStore.has(key)) {
          return null; // Key exists, NX fails
        }
        redisStore.set(key, val);
        return "OK";
      }),
      del: jest.fn(async (key: string) => {
        redisStore.delete(key);
        return 1;
      }),
    };

    mockPrisma = {
      query: jest.fn(async (query: string, params: any[] = []) => {
        if (query.includes("INSERT INTO notifications")) {
          const newNotif = {
            id: `notif-${storedNotifications.length + 1}`,
            userId: params[0],
            type: params[1],
            title: params[2],
            body: params[3],
            data: JSON.parse(params[4]),
            isRead: false,
            createdAt: new Date(),
          };
          storedNotifications.push(newNotif);
          return [newNotif];
        }

        if (query.includes("SELECT fcm_token, email, phone FROM users")) {
          return [
            {
              fcm_token: "fcm-token-123",
              email: "user@example.com",
              phone: "+923001234567",
            },
          ];
        }

        if (
          query.includes("SELECT COUNT(*)::text as count FROM notifications")
        ) {
          const userId = params[0];
          const unread = storedNotifications.filter(
            (n) => n.userId === userId && !n.isRead,
          );
          return [{ count: String(unread.length) }];
        }

        if (
          query.includes('SELECT id, user_id as "userId"') &&
          query.includes("FROM notifications")
        ) {
          const userId = params[0];
          const list = storedNotifications.filter((n) => n.userId === userId);
          return list;
        }

        if (query.includes("UPDATE notifications")) {
          const notifId = params[0];
          const userId = params[1];
          const item = storedNotifications.find(
            (n) => n.id === notifId && n.userId === userId,
          );
          if (item) {
            item.isRead = true;
            return [item];
          }
          return [];
        }

        if (query.includes("UPDATE users SET fcm_token")) {
          return [];
        }

        return [];
      }),
    };

    service = new NotificationService(
      mockPrisma as unknown as PrismaService,
      mockRedis as any,
    );
    await service.onModuleInit();

    // Mock BullMQ Queue add method
    mockQueue = (service as any).queue;
    mockQueue.add = jest.fn().mockResolvedValue({ id: "job-123" });
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // ─── 1. Deduplication ───────────────────────────────────────────────────────

  it("enqueues the first notification and suppresses a duplicate within the dedup window", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const type = "TRIP_ASSIGNED";
    const entityId = "trip-100";
    const dto = { title: "Trip Assigned", body: "New trip assigned to you" };

    // First call: should succeed and enqueue
    const result1 = await service.enqueue(userId, type, entityId, dto);
    expect(result1).not.toBeNull();
    expect(result1?.id).toBe("notif-1");
    expect(mockQueue.add).toHaveBeenCalledTimes(1);

    // Second call: duplicate within window should be suppressed
    const result2 = await service.enqueue(userId, type, entityId, dto);
    expect(result2).toBeNull();
    // BullMQ should not have been called a second time
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  // ─── 2. In-App Persistence Resilience ──────────────────────────────────────

  it("persists in-app notification record even if BullMQ enqueue fails", async () => {
    mockQueue.add = jest
      .fn()
      .mockRejectedValueOnce(new Error("Redis broker disconnected"));

    const userId = "00000000-0000-0000-0000-000000000002";
    const result = await service.enqueue(
      userId,
      "PAYMENT_RECEIPT",
      "receipt-1",
      {
        title: "Receipt",
        body: "Your receipt for Trip #1",
      },
    );

    // In-app record was persisted despite queue error
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Receipt");
    expect(storedNotifications).toHaveLength(1);
  });

  // ─── 3. List & Mark Read ───────────────────────────────────────────────────

  it("lists notifications for the user and marks one as read", async () => {
    const userId = "00000000-0000-0000-0000-000000000003";

    await service.enqueue(userId, "TRIP_EN_ROUTE", "trip-1", {
      title: "1",
      body: "b1",
    });
    await service.enqueue(userId, "TRIP_ARRIVED", "trip-2", {
      title: "2",
      body: "b2",
    });

    const list = await service.listForUser(userId);
    expect(list.data).toHaveLength(2);
    expect(list.data[0]!.isRead).toBe(false);

    // Mark notif-1 as read
    const updated = await service.markRead(userId, "notif-1");
    expect(updated.isRead).toBe(true);
    expect(mockRedis.del).toHaveBeenCalledWith(`notif:unread:${userId}`);
  });

  it("throws NotFoundException when marking a non-existent or unowned notification as read", async () => {
    const userId = "00000000-0000-0000-0000-000000000003";
    await expect(service.markRead(userId, "non-existent-id")).rejects.toThrow();
  });

  // ─── 4. Unread Count & Cache ───────────────────────────────────────────────

  it("caches unread count in Redis for 10 seconds", async () => {
    const userId = "00000000-0000-0000-0000-000000000004";
    await service.enqueue(userId, "TRIP_STARTED", "t-1", {
      title: "Start",
      body: "b",
    });

    // First count: DB query + cached
    const count1 = await service.getUnreadCount(userId);
    expect(count1).toBe(1);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `notif:unread:${userId}`,
      "1",
      "EX",
      10,
    );

    // Second count: reads from cache without hitting DB count
    mockRedis.get.mockResolvedValueOnce("1");
    const count2 = await service.getUnreadCount(userId);
    expect(count2).toBe(1);
  });

  // ─── 5. FCM Token Registration ────────────────────────────────────────────

  it("registers and clears user FCM token", async () => {
    const userId = "00000000-0000-0000-0000-000000000005";

    await service.registerFcmToken(userId, "new-device-token");
    expect(mockPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users SET fcm_token = $1"),
      ["new-device-token", userId],
    );

    await service.clearFcmToken(userId);
    expect(mockPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users SET fcm_token = NULL"),
      [userId],
    );
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotificationWorkerService } from "./notification-worker.service";
import { StaleTokenError } from "./adapters/fcm.adapter";
import type { Job } from "bullmq";
import type { DeliveryPayload } from "./adapters/notification-channel.interface";

describe("NotificationWorkerService", () => {
  let service: NotificationWorkerService;
  let mockFcmAdapter: { send: jest.Mock };
  let mockSendgridAdapter: { send: jest.Mock };
  let mockSmsAdapter: { send: jest.Mock };
  let mockDbService: { clearUserFcmToken: jest.Mock };

  beforeEach(() => {
    mockFcmAdapter = { send: jest.fn().mockResolvedValue(undefined) };
    mockSendgridAdapter = { send: jest.fn().mockResolvedValue(undefined) };
    mockSmsAdapter = { send: jest.fn().mockResolvedValue(undefined) };
    mockDbService = {
      clearUserFcmToken: jest.fn().mockResolvedValue(undefined),
    };

    service = new NotificationWorkerService(
      mockFcmAdapter as any,
      mockSendgridAdapter as any,
      mockSmsAdapter as any,
      mockDbService as any,
    );
  });

  it("delivers push notification when fcmToken is present", async () => {
    const payload: DeliveryPayload = {
      userId: "user-123",
      fcmToken: "valid-fcm-token",
      type: "TRIP_ASSIGNED",
      title: "Trip Assigned",
      body: "You have a new trip.",
      notificationId: "notif-1",
    };

    const mockJob = { id: "job-1", data: payload } as Job<DeliveryPayload>;

    await service.processJob(mockJob);

    expect(mockFcmAdapter.send).toHaveBeenCalledWith(payload);
    expect(mockDbService.clearUserFcmToken).not.toHaveBeenCalled();
  });

  it("clears stale FCM token in database when StaleTokenError is thrown", async () => {
    mockFcmAdapter.send.mockRejectedValueOnce(
      new StaleTokenError("stale-token", "Token unregistered"),
    );

    const payload: DeliveryPayload = {
      userId: "user-456",
      fcmToken: "stale-token",
      type: "TRIP_STARTED",
      title: "Trip Started",
      body: "Your driver is on the way.",
      notificationId: "notif-2",
    };

    const mockJob = { id: "job-2", data: payload } as Job<DeliveryPayload>;

    // Should catch the StaleTokenError, clear the token, and not fail the job
    await expect(service.processJob(mockJob)).resolves.not.toThrow();

    expect(mockDbService.clearUserFcmToken).toHaveBeenCalledWith("user-456");
  });

  it("delivers email for eligible notification types", async () => {
    const payload: DeliveryPayload = {
      userId: "user-789",
      email: "user@example.com",
      type: "SUBSCRIPTION_CONFIRMED",
      title: "Subscription Confirmed",
      body: "Your monthly pass is active.",
      notificationId: "notif-3",
    };

    const mockJob = { id: "job-3", data: payload } as Job<DeliveryPayload>;

    await service.processJob(mockJob);

    expect(mockSendgridAdapter.send).toHaveBeenCalledWith(payload);
  });

  it("delivers SMS for critical emergency notification types", async () => {
    const payload: DeliveryPayload = {
      userId: "user-999",
      phone: "+923001234567",
      type: "TRIP_CANCELLED",
      title: "Trip Cancelled",
      body: "Your trip was cancelled by driver.",
      notificationId: "notif-4",
    };

    const mockJob = { id: "job-4", data: payload } as Job<DeliveryPayload>;

    await service.processJob(mockJob);

    expect(mockSmsAdapter.send).toHaveBeenCalledWith(payload);
  });

  it("re-throws when a channel throws an unrecoverable delivery error", async () => {
    mockFcmAdapter.send.mockRejectedValueOnce(new Error("Network timeout"));

    const payload: DeliveryPayload = {
      userId: "user-000",
      fcmToken: "token-abc",
      type: "TRIP_UPDATE",
      title: "Update",
      body: "Update info",
      notificationId: "notif-5",
    };

    const mockJob = { id: "job-5", data: payload } as Job<DeliveryPayload>;

    await expect(service.processJob(mockJob)).rejects.toThrow(
      "Delivery error for job job-5: Network timeout",
    );
  });
});

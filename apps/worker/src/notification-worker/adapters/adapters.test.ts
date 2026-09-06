/* eslint-disable @typescript-eslint/no-explicit-any */
import { FcmAdapter, StaleTokenError } from "./fcm.adapter";
import { SendgridAdapter } from "./sendgrid.adapter";
import { DevSmsAdapter } from "./sms-channel.interface";
import * as admin from "firebase-admin";
import sgMail from "@sendgrid/mail";

jest.mock("firebase-admin", () => {
  const sendMock = jest.fn();
  return {
    apps: [],
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
    messaging: () => ({
      send: sendMock,
    }),
    __sendMock: sendMock,
  };
});

jest.mock("@sendgrid/mail", () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

describe("Delivery Adapters", () => {
  const payload = {
    userId: "user-1",
    notificationId: "notif-1",
    type: "TRIP_ASSIGNED",
    title: "New Trip",
    body: "Details here",
    fcmToken: "mock-fcm-token",
    email: "test@example.com",
    phone: "+923001234567",
  };

  describe("FcmAdapter", () => {
    it("handles simulated push when no service account is configured", async () => {
      const adapter = new FcmAdapter();
      await expect(adapter.send(payload)).resolves.not.toThrow();
    });

    it("returns early when payload has no fcmToken", async () => {
      const adapter = new FcmAdapter();
      await expect(
        adapter.send({ ...payload, fcmToken: null }),
      ).resolves.not.toThrow();
    });

    it("throws StaleTokenError when firebase returns token not registered", async () => {
      const adapter = new FcmAdapter();
      (adapter as any).initialized = true;

      const sendMock = (admin as any).__sendMock;
      sendMock.mockRejectedValueOnce({
        code: "messaging/registration-token-not-registered",
      });

      await expect(adapter.send(payload)).rejects.toThrow(StaleTokenError);
    });

    it("sends push successfully when initialized", async () => {
      const adapter = new FcmAdapter();
      (adapter as any).initialized = true;

      const sendMock = (admin as any).__sendMock;
      sendMock.mockResolvedValueOnce("msg-123");

      await expect(adapter.send(payload)).resolves.not.toThrow();
      expect(sendMock).toHaveBeenCalledWith({
        token: "mock-fcm-token",
        notification: {
          title: "New Trip",
          body: "Details here",
        },
        data: {
          notificationId: "notif-1",
          type: "TRIP_ASSIGNED",
        },
      });
    });
  });

  describe("SendgridAdapter", () => {
    it("returns early when payload has no email", async () => {
      const adapter = new SendgridAdapter();
      await expect(
        adapter.send({ ...payload, email: null }),
      ).resolves.not.toThrow();
    });

    it("simulates email when SENDGRID_API_KEY is missing", async () => {
      const adapter = new SendgridAdapter();
      await expect(adapter.send(payload)).resolves.not.toThrow();
    });

    it("sends email when initialized with API key", async () => {
      process.env["SENDGRID_API_KEY"] = "SG.mock-key";
      const adapter = new SendgridAdapter();

      await expect(adapter.send(payload)).resolves.not.toThrow();
      expect(sgMail.send).toHaveBeenCalled();
      delete process.env["SENDGRID_API_KEY"];
    });
  });

  describe("DevSmsAdapter", () => {
    it("logs SMS and completes without error", async () => {
      const adapter = new DevSmsAdapter();
      expect(adapter.providerName).toBe("dev-console");
      await expect(adapter.send(payload)).resolves.not.toThrow();
    });
  });
});

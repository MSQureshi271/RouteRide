/**
 * FCM notification channel adapter.
 *
 * Delivers push notifications via firebase-admin.
 * Detects stale/unregistered tokens (UNREGISTERED / invalid registration token)
 * and triggers a cleanup callback so the database drops the dead token.
 */
import { Injectable, Logger } from "@nestjs/common";
import * as admin from "firebase-admin";
import type {
  DeliveryPayload,
  NotificationChannel,
} from "./notification-channel.interface";

export class StaleTokenError extends Error {
  constructor(
    public readonly token: string,
    message: string,
  ) {
    super(message);
    this.name = "StaleTokenError";
  }
}

@Injectable()
export class FcmAdapter implements NotificationChannel {
  private readonly logger = new Logger(FcmAdapter.name);
  private initialized = false;

  constructor() {
    this.initFirebase();
  }

  private initFirebase(): void {
    if (admin.apps.length > 0) {
      this.initialized = true;
      return;
    }

    try {
      const serviceAccountPath = process.env["FIREBASE_SERVICE_ACCOUNT_PATH"];
      if (serviceAccountPath) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
        });
        this.initialized = true;
      } else {
        this.logger.warn(
          "FIREBASE_SERVICE_ACCOUNT_PATH not provided. FCM notifications will be simulated.",
        );
      }
    } catch (err) {
      this.logger.error("Failed to initialize Firebase Admin SDK", err);
    }
  }

  async send(payload: DeliveryPayload): Promise<void> {
    if (!payload.fcmToken) {
      this.logger.debug(`No FCM token provided for user ${payload.userId}`);
      return;
    }

    if (!this.initialized) {
      this.logger.log(
        `[FCM:SIMULATED] To: ${payload.fcmToken.slice(0, 10)}... Title: ${payload.title}`,
      );
      return;
    }

    try {
      await admin.messaging().send({
        token: payload.fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          notificationId: payload.notificationId,
          type: payload.type,
          ...payload.data,
        },
      });
      this.logger.debug(
        `Push sent successfully to user ${payload.userId} (token: ${payload.fcmToken.slice(0, 8)}...)`,
      );
    } catch (error: unknown) {
      const err = error as { code?: string; errorInfo?: { code?: string } };
      const errorCode = err?.code || err?.errorInfo?.code;
      if (
        errorCode === "messaging/registration-token-not-registered" ||
        errorCode === "messaging/invalid-registration-token"
      ) {
        this.logger.warn(
          `Stale/invalid FCM token detected for user ${payload.userId}: ${payload.fcmToken}`,
        );
        throw new StaleTokenError(
          payload.fcmToken,
          `FCM token is unregistered or invalid (${errorCode})`,
        );
      }
      throw error;
    }
  }
}

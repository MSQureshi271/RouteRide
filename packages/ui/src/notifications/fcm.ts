/**
 * FCM device registration & deep linking handlers.
 *
 * Provides functions for:
 *  - Registering device token with the backend API
 *  - Unregistering token on logout
 *  - Handling foreground notifications (invokes Toast callback)
 *  - Handling cold-start & background tap routing via deep links
 */
import type { AxiosInstance } from "axios";
import {
  getConsumerDeepLink,
  getDriverDeepLink,
  type NotificationPayloadData,
} from "./deep-link";

export interface NotificationHandlerConfig {
  role: "consumer" | "driver";
  onShowToast?: (title: string, message: string) => void;
  onNavigate?: (path: string) => void;
}

/**
 * Register device token with RouteRide API.
 */
export async function registerFcmToken(
  apiClient: AxiosInstance,
  token: string,
): Promise<void> {
  try {
    await apiClient.post("/notifications/fcm-token", { token });
  } catch (error) {
    console.error("Failed to register FCM token with server:", error);
  }
}

/**
 * Unregister device token from RouteRide API on logout.
 */
export async function unregisterFcmToken(
  apiClient: AxiosInstance,
): Promise<void> {
  try {
    await apiClient.delete("/notifications/fcm-token");
  } catch (error) {
    console.warn("Failed to unregister FCM token from server:", error);
  }
}

/**
 * Resolve routing path when user taps a push notification.
 */
export function resolveNotificationRoute(
  role: "consumer" | "driver",
  data: NotificationPayloadData,
): string {
  return role === "driver"
    ? getDriverDeepLink(data)
    : getConsumerDeepLink(data);
}

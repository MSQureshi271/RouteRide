/**
 * Delivery payload — the shape of each BullMQ job.
 * Matches what notification.service.ts enqueues.
 */
export interface DeliveryPayload {
  /** User's DB ID */
  userId: string;
  /** FCM token for push delivery (may be absent for SMS/email-only users) */
  fcmToken?: string | null;
  /** User's email address (may be absent) */
  email?: string | null;
  /** User's phone number in E.164 (may be absent) */
  phone?: string | null;
  /** Primary notification type — used to route to correct channel */
  type: string;
  /** Notification title */
  title: string;
  /** Notification body */
  body: string;
  /** Arbitrary structured data passed through to the push payload */
  data?: Record<string, string>;
  /** DB ID of the notification record for status updates */
  notificationId: string;
}

/**
 * NotificationChannel — the provider-agnostic delivery interface.
 *
 * Every delivery adapter (FCM, SendGrid, SMS stub) implements this.
 * Implementing a new SMS provider (e.g. Vonage) means creating a class
 * that satisfies this interface — no other code changes needed.
 */
export interface NotificationChannel {
  send(payload: DeliveryPayload): Promise<void>;
}

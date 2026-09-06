/**
 * Exhaustive typed registry of notification types across RouteRide.
 * Derived from TRD §9.2 (Platform Notification Catalogue).
 */

export const NotificationType = {
  // Trips
  TRIP_ASSIGNED: "TRIP_ASSIGNED",
  TRIP_STARTED: "TRIP_STARTED",
  TRIP_EN_ROUTE: "TRIP_EN_ROUTE",
  TRIP_APPROACHING: "TRIP_APPROACHING",
  TRIP_ARRIVED: "TRIP_ARRIVED",
  TRIP_COMPLETED: "TRIP_COMPLETED",
  TRIP_CANCELLED: "TRIP_CANCELLED",
  TRIP_CRITICAL_DELAY: "TRIP_CRITICAL_DELAY",

  // Subscriptions
  SUBSCRIPTION_CREATED: "SUBSCRIPTION_CREATED",
  SUBSCRIPTION_CONFIRMED: "SUBSCRIPTION_CONFIRMED",
  SUBSCRIPTION_PAUSED: "SUBSCRIPTION_PAUSED",
  SUBSCRIPTION_RESUMED: "SUBSCRIPTION_RESUMED",
  SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED",

  // Payments
  PAYMENT_SUCCEEDED: "PAYMENT_SUCCEEDED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_RECEIPT: "PAYMENT_RECEIPT",

  // Driver Lifecycle
  DRIVER_VERIFIED: "DRIVER_VERIFIED",
  DRIVER_REJECTED: "DRIVER_REJECTED",
  DRIVER_EMERGENCY: "DRIVER_EMERGENCY",

  // Account & Security
  ACCOUNT_SECURITY_ALERT: "ACCOUNT_SECURITY_ALERT",
} as const;

export type NotificationTypeValue =
  (typeof NotificationType)[keyof typeof NotificationType];

export interface NotificationMeta {
  titleTemplate: string;
  defaultChannel: "push" | "email" | "sms" | "in_app";
  priority: "high" | "normal" | "low";
}

export const NOTIFICATION_METADATA: Record<
  NotificationTypeValue,
  NotificationMeta
> = {
  [NotificationType.TRIP_ASSIGNED]: {
    titleTemplate: "New Trip Assigned",
    defaultChannel: "push",
    priority: "high",
  },
  [NotificationType.TRIP_STARTED]: {
    titleTemplate: "Driver is on the way",
    defaultChannel: "push",
    priority: "high",
  },
  [NotificationType.TRIP_EN_ROUTE]: {
    titleTemplate: "Trip In Progress",
    defaultChannel: "push",
    priority: "normal",
  },
  [NotificationType.TRIP_APPROACHING]: {
    titleTemplate: "Driver Arriving Soon",
    defaultChannel: "push",
    priority: "high",
  },
  [NotificationType.TRIP_ARRIVED]: {
    titleTemplate: "Driver Has Arrived",
    defaultChannel: "push",
    priority: "high",
  },
  [NotificationType.TRIP_COMPLETED]: {
    titleTemplate: "Trip Completed",
    defaultChannel: "push",
    priority: "normal",
  },
  [NotificationType.TRIP_CANCELLED]: {
    titleTemplate: "Trip Cancelled",
    defaultChannel: "sms",
    priority: "high",
  },
  [NotificationType.TRIP_CRITICAL_DELAY]: {
    titleTemplate: "Important: Trip Delay",
    defaultChannel: "sms",
    priority: "high",
  },
  [NotificationType.SUBSCRIPTION_CREATED]: {
    titleTemplate: "Subscription Request Received",
    defaultChannel: "push",
    priority: "normal",
  },
  [NotificationType.SUBSCRIPTION_CONFIRMED]: {
    titleTemplate: "Subscription Confirmed!",
    defaultChannel: "email",
    priority: "high",
  },
  [NotificationType.SUBSCRIPTION_PAUSED]: {
    titleTemplate: "Subscription Paused",
    defaultChannel: "push",
    priority: "normal",
  },
  [NotificationType.SUBSCRIPTION_RESUMED]: {
    titleTemplate: "Subscription Resumed",
    defaultChannel: "push",
    priority: "normal",
  },
  [NotificationType.SUBSCRIPTION_CANCELLED]: {
    titleTemplate: "Subscription Cancelled",
    defaultChannel: "email",
    priority: "high",
  },
  [NotificationType.PAYMENT_SUCCEEDED]: {
    titleTemplate: "Payment Received",
    defaultChannel: "push",
    priority: "normal",
  },
  [NotificationType.PAYMENT_FAILED]: {
    titleTemplate: "Payment Action Required",
    defaultChannel: "email",
    priority: "high",
  },
  [NotificationType.PAYMENT_RECEIPT]: {
    titleTemplate: "Your RouteRide Receipt",
    defaultChannel: "email",
    priority: "normal",
  },
  [NotificationType.DRIVER_VERIFIED]: {
    titleTemplate: "Profile Approved!",
    defaultChannel: "push",
    priority: "high",
  },
  [NotificationType.DRIVER_REJECTED]: {
    titleTemplate: "Verification Update",
    defaultChannel: "email",
    priority: "high",
  },
  [NotificationType.DRIVER_EMERGENCY]: {
    titleTemplate: "EMERGENCY ALERT",
    defaultChannel: "sms",
    priority: "high",
  },
  [NotificationType.ACCOUNT_SECURITY_ALERT]: {
    titleTemplate: "Security Alert",
    defaultChannel: "email",
    priority: "high",
  },
};

/**
 * Notification deep link routing for RouteRide mobile apps.
 *
 * Maps notification types and payloads to Expo Router paths
 * for both Consumer and Driver mobile applications.
 */

export interface NotificationPayloadData {
  type?: string;
  tripId?: string;
  subscriptionId?: string;
  url?: string;
  [key: string]: string | undefined;
}

export function getConsumerDeepLink(data: NotificationPayloadData): string {
  if (data.url) return data.url;

  switch (data.type) {
    case "TRIP_ASSIGNED":
    case "TRIP_STARTED":
    case "TRIP_EN_ROUTE":
    case "TRIP_APPROACHING":
    case "TRIP_ARRIVED":
      return data.tripId ? `/(app)/trip/${data.tripId}` : "/(app)";

    case "SUBSCRIPTION_CREATED":
    case "SUBSCRIPTION_CONFIRMED":
    case "SUBSCRIPTION_PAUSED":
    case "SUBSCRIPTION_RESUMED":
    case "SUBSCRIPTION_CANCELLED":
      return data.subscriptionId
        ? `/(app)/subscription/${data.subscriptionId}`
        : "/(app)/subscriptions";

    case "PAYMENT_SUCCEEDED":
    case "PAYMENT_FAILED":
    case "PAYMENT_RECEIPT":
      return "/(app)/payments";

    default:
      return "/(app)/notifications";
  }
}

export function getDriverDeepLink(data: NotificationPayloadData): string {
  if (data.url) return data.url;

  switch (data.type) {
    case "TRIP_ASSIGNED":
    case "TRIP_STARTED":
    case "TRIP_CRITICAL_DELAY":
      return data.tripId ? `/(app)/manifest/${data.tripId}` : "/(app)";

    case "DRIVER_VERIFIED":
    case "DRIVER_REJECTED":
      return "/(app)/profile";

    default:
      return "/(app)/notifications";
  }
}

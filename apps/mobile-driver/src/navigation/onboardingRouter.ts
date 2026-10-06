import { router } from "expo-router";
import { getApiClient } from "@routeride/ui";
import type {
  DriverOnboardingStage,
  DriverOnboardingStatus,
} from "@routeride/contracts";

/**
 * Maps the server's derived onboarding stage to the exact Expo Router route.
 * Single source of truth for onboarding navigation mapping.
 */
export function getOnboardingRoute(step: DriverOnboardingStage): string {
  switch (step) {
    case "step1-vehicle":
      return "/(onboarding)/step1-vehicle";
    case "step2-documents":
      return "/(onboarding)/step2-documents";
    case "step4-availability":
      return "/(onboarding)/step4-availability";
    case "pending":
      return "/(onboarding)/pending";
    case "approved":
      return "/(app)";
    case "rejected":
    case "suspended":
      return "/(onboarding)/pending";
    default:
      return "/(onboarding)/step1-vehicle";
  }
}

/**
 * Fetches the driver's current onboarding status from the backend,
 * and navigates to the authoritative step.
 */
export async function fetchAndNavigateToOnboardingStep(): Promise<DriverOnboardingStatus> {
  const client = getApiClient();
  const res = await client.get<DriverOnboardingStatus>(
    "/drivers/me/onboarding-status",
  );
  const data =
    (res.data as unknown as { data?: DriverOnboardingStatus })?.data ??
    res.data;
  const targetRoute = getOnboardingRoute(data.currentStep);
  router.replace(targetRoute as never);
  return data;
}

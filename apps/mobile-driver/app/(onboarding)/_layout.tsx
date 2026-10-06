/**
 * Driver onboarding stack layout.
 *
 * Wraps the 3-step wizard and pending screen in a Stack navigator.
 *
 * Steps:
 *  1. step1-vehicle      — personal + vehicle details (POST /drivers/onboard)
 *  2. step2-documents    — document uploads (POST /drivers/me/documents/upload-url + /confirm)
 *  3. step4-availability — operating days + pricing (PATCH /drivers/me)
 *  4. pending            — "Application under review" terminal state
 *
 * Route entry is done post-onboarding from the driver dashboard
 * (Settings → My Route), so step3-route has been removed from this flow.
 */
import { Redirect, Stack } from "expo-router";
import { colors, useAuthStore, type AuthState } from "@routeride/ui";

export default function OnboardingLayout() {
  const accessToken = useAuthStore((s: AuthState) => s.accessToken);

  if (!accessToken) {
    return <Redirect href={"/(auth)/login" as never} />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceContainerLowest },
        headerTintColor: colors.secondary,
        headerTitleStyle: { fontFamily: "Manrope-SemiBold" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="step1-vehicle"
        options={{ title: "Step 1 of 3 — Vehicle Details" }}
      />
      <Stack.Screen
        name="step2-documents"
        options={{ title: "Step 2 of 3 — Documents" }}
      />
      <Stack.Screen
        name="step4-availability"
        options={{ title: "Step 3 of 3 — Availability" }}
      />
      <Stack.Screen
        name="pending"
        options={{ title: "Application Submitted", headerBackVisible: false }}
      />
    </Stack>
  );
}

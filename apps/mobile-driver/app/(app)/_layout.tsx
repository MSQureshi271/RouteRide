/**
 * Driver app shell — route-gated for authenticated DRIVER users.
 *
 * Route guard logic:
 *  1. No access token → /(auth)/login
 *  2. Authenticated: check server derived onboarding status (/drivers/me/onboarding-status)
 *     - If currentStep !== "approved" (or status !== "APPROVED") → redirect to getOnboardingRoute(currentStep)
 *     - If network error → fail-closed error screen with retry (NEVER fail open)
 *     - Only when currentStep === "approved" && status === "APPROVED" → render tab bar
 *
 * Uses Safety Emerald as the active tab tint.
 */
import React, { useEffect, useState } from "react";
import { Redirect, Tabs, router } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  Button,
  getApiClient,
  useAuthStore,
  type AuthState,
  colors,
  spacing,
  typography,
} from "@routeride/ui";
import type { DriverOnboardingStatus } from "@routeride/contracts";
import { getOnboardingRoute } from "../../src/navigation/onboardingRouter";

type GuardState = "loading" | "error" | "redirecting" | "approved";

export default function DriverAppLayout() {
  const accessToken = useAuthStore((s: AuthState) => s.accessToken);
  const [guardState, setGuardState] = useState<GuardState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkStatus = async () => {
    setGuardState("loading");
    setErrorMessage(null);
    try {
      const client = getApiClient();
      const res = await client.get<DriverOnboardingStatus>(
        "/drivers/me/onboarding-status",
      );
      const data =
        (res.data as unknown as { data?: DriverOnboardingStatus })?.data ??
        res.data;

      if (data.currentStep === "approved" && data.status === "APPROVED") {
        setGuardState("approved");
      } else {
        setGuardState("redirecting");
        const targetRoute = getOnboardingRoute(data.currentStep);
        router.replace(targetRoute as never);
      }
    } catch {
      setErrorMessage(
        "Could not verify driver account status. Please check your internet connection.",
      );
      setGuardState("error");
    }
  };

  useEffect(() => {
    if (accessToken) {
      void checkStatus();
    }
  }, [accessToken]);

  if (!accessToken) {
    return <Redirect href={"/(auth)/login" as never} />;
  }

  if (guardState === "loading" || guardState === "redirecting") {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (guardState === "error") {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Verification Error</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <Button
          variant="primary"
          role="driver"
          onPress={checkStatus}
          accessibilityLabel="Retry status check"
        >
          Retry
        </Button>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.secondary, // Safety Emerald for driver
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: colors.surfaceContainerLowest,
          borderTopColor: colors.outlineVariant,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20 }}>🚗</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20 }}>🔔</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="route-settings"
        options={{
          href: null,
          title: "My Route",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  errorTitle: {
    ...typography.headlineLgMobile,
    color: colors.onBackground,
    textAlign: "center",
  },
  errorMessage: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
});

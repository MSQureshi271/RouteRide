/**
 * Pending Verification Screen — terminal state after onboarding wizard completion.
 *
 * Features:
 *  - Explains application review timeline (up to 48 hours)
 *  - Automatically checks driver status on mount; redirects to /(app) if APPROVED
 *  - "Check Status" button to allow manual status refresh
 *  - Working "Log out" button that clears tokens and redirects to /(auth)/login
 *  - Screen-reader friendly and fully accessible
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Button,
  useAuthStore,
  getApiClient,
  colors,
  fontFamilies,
  radii,
  spacing,
} from "@routeride/ui";
import { getOnboardingRoute } from "../../src/navigation/onboardingRouter";
import type { DriverOnboardingStatus } from "@routeride/contracts";

export default function PendingScreen() {
  const { logout } = useAuthStore();
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const checkStatus = async () => {
    setCheckingStatus(true);
    setStatusMessage(null);
    try {
      const client = getApiClient();
      const res = await client.get<DriverOnboardingStatus>(
        "/drivers/me/onboarding-status",
      );
      const data =
        (res.data as unknown as { data?: DriverOnboardingStatus })?.data ??
        res.data;
      if (data.currentStep === "approved" && data.status === "APPROVED") {
        router.replace("/(app)" as never);
        return;
      }
      if (data.currentStep && data.currentStep !== "pending") {
        router.replace(getOnboardingRoute(data.currentStep) as never);
        return;
      }
      setStatusMessage(
        "Your application is currently under review by our verification team.",
      );
    } catch {
      setStatusMessage(
        "Could not check status. Please check your internet connection.",
      );
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    void checkStatus();
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login" as never);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Icon */}
        <View style={styles.iconContainer} accessibilityElementsHidden>
          <Text style={styles.icon}>⏳</Text>
        </View>

        {/* Heading */}
        <Text style={styles.title} accessibilityRole="header">
          Application Under Review
        </Text>

        {statusMessage && (
          <View style={styles.statusBanner} accessibilityRole="alert">
            <Text style={styles.statusBannerText}>{statusMessage}</Text>
          </View>
        )}

        {/* Explanation Card */}
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            Thank you for applying to drive with RouteRide. Our verification
            team is reviewing your application and submitted documents.
          </Text>

          <View style={styles.timelineItem}>
            <Text style={styles.bullet}>✓</Text>
            <Text style={styles.timelineText}>Application submitted</Text>
          </View>
          <View style={styles.timelineItem}>
            <Text style={styles.bullet}>⟳</Text>
            <Text style={styles.timelineText}>
              Document verification — up to 48 hours
            </Text>
          </View>
          <View style={styles.timelineItem}>
            <Text style={styles.bullet}>○</Text>
            <Text style={styles.timelineText}>Background check</Text>
          </View>
          <View style={styles.timelineItem}>
            <Text style={styles.bullet}>○</Text>
            <Text style={styles.timelineText}>
              Account activation & route matching
            </Text>
          </View>
        </View>

        {/* Contact note */}
        <Text style={styles.noteText}>
          Questions or updates? Contact support at support@routeride.pk
        </Text>

        {/* Actions */}
        <View style={styles.actionContainer}>
          <Button
            variant="primary"
            role="driver"
            loading={checkingStatus}
            onPress={checkStatus}
            accessibilityLabel="Check approval status"
            testID="check-status-btn"
          >
            Check Approval Status
          </Button>

          <Button
            variant="secondary"
            role="driver"
            onPress={handleLogout}
            accessibilityLabel="Log out"
            testID="pending-logout-btn"
            style={styles.logoutBtn}
          >
            Log out
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    padding: spacing.base,
    justifyContent: "center",
    gap: spacing.md,
  },
  iconContainer: {
    alignItems: "center",
  },
  icon: {
    fontSize: 56,
    textAlign: "center",
  },
  title: {
    fontFamily: fontFamilies.headlineBold,
    fontSize: 24,
    lineHeight: 32,
    color: colors.onBackground,
    textAlign: "center",
  },
  statusBanner: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
  },
  statusBannerText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    color: colors.onSurface,
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: spacing.base,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  bodyText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 14,
    color: colors.onSurface,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bullet: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 14,
    color: colors.secondary,
    width: 20,
  },
  timelineText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    color: colors.onSurface,
    flex: 1,
  },
  noteText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    color: colors.outline,
    textAlign: "center",
  },
  actionContainer: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  logoutBtn: {
    marginTop: spacing.xs,
  },
});

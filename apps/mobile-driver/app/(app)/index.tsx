/**
 * Driver Dashboard Screen.
 *
 * Displays:
 *  - Driver greeting & status badge (PENDING or APPROVED)
 *  - "My Route" status card with action button navigating to route-settings:
 *      * Prominent CTA when route is unset: "Set your route to start receiving passengers"
 *      * Active summary card when route is set: "Route active — tap to update"
 *  - Vehicle information summary
 *  - Logout button
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import {
  Button,
  colors,
  fontFamilies,
  getApiClient,
  radii,
  spacing,
  useAuthStore,
} from "@routeride/ui";

interface DriverProfileData {
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  vehicleMake?: string;
  vehicleModel?: string;
  plateNumber?: string;
  routePolyline?: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

export default function DriverHomeScreen() {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<DriverProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const client = getApiClient();
      const response = await client.get<DriverProfileData>("/drivers/me");
      if (response.data) {
        setProfile(response.data);
      }
    } catch {
      // Non-blocking in dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchProfile();
    }, [fetchProfile]),
  );

  const hasRoute = Boolean(
    profile?.routePolyline?.coordinates &&
    profile.routePolyline.coordinates.length >= 2,
  );

  const stopCount = profile?.routePolyline?.coordinates?.length ?? 0;
  const isPending = profile?.status === "PENDING";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.driverName}>
              {user?.fullName || user?.phone || "Driver"}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              isPending
                ? styles.statusBadgePending
                : styles.statusBadgeApproved,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isPending
                  ? styles.statusBadgeTextPending
                  : styles.statusBadgeTextApproved,
              ]}
            >
              {profile?.status === "APPROVED"
                ? "✓ VERIFIED"
                : profile?.status === "PENDING"
                  ? "⏳ UNDER REVIEW"
                  : profile?.status || "REGISTERED"}
            </Text>
          </View>
        </View>

        {isPending && (
          <View style={styles.pendingNotice}>
            <Text style={styles.pendingNoticeText}>
              ℹ️ Your documents are being verified by our team. You can set up
              your daily route in the meantime.
            </Text>
          </View>
        )}

        {/* My Route Card */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Commute & Route</Text>

          {loading ? (
            <View style={styles.routeCardLoading}>
              <ActivityIndicator color={colors.secondary} size="small" />
              <Text style={styles.loadingText}>Checking route status...</Text>
            </View>
          ) : hasRoute ? (
            <View style={styles.routeCardActive} testID="route-active-card">
              <View style={styles.routeCardHeader}>
                <View style={styles.routeActiveDot} />
                <Text style={styles.routeActiveTitle}>Daily Route Active</Text>
              </View>
              <Text style={styles.routeActiveDescription}>
                You have {stopCount} stops configured along your typical
                commute. Passengers travelling along your path will be able to
                match with you.
              </Text>

              <TouchableOpacity
                style={styles.manageRouteBtn}
                onPress={() => router.push("/(app)/route-settings" as never)}
                accessibilityLabel="Manage route stops"
                accessibilityRole="button"
                testID="manage-route-btn"
              >
                <Text style={styles.manageRouteBtnText}>
                  Manage Route Stops →
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.routeCardUnset} testID="route-unset-card">
              <View style={styles.routeCardHeader}>
                <Text style={styles.routeUnsetEmoji}>📍</Text>
                <Text style={styles.routeUnsetTitle}>No Route Configured</Text>
              </View>
              <Text style={styles.routeUnsetDescription}>
                Add the stops you regularly drive to receive ride requests along
                your daily commute.
              </Text>

              <Button
                variant="primary"
                role="driver"
                onPress={() => router.push("/(app)/route-settings" as never)}
                accessibilityLabel="Set your route now"
                testID="set-route-cta-btn"
              >
                Set Route Now
              </Button>
            </View>
          )}
        </View>

        {/* Vehicle Details Card */}
        {profile?.vehicleMake && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Vehicle</Text>
            <View style={styles.vehicleCard}>
              <Text style={styles.vehicleName}>
                🚗 {profile.vehicleMake} {profile.vehicleModel}
              </Text>
              {profile.plateNumber && (
                <Text style={styles.vehiclePlate}>
                  Plate: {profile.plateNumber}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Account / Logout */}
        <View style={styles.footerSection}>
          <Button
            variant="secondary"
            role="driver"
            onPress={() => logout()}
            accessibilityLabel="Log out"
            testID="driver-logout-btn"
          >
            Log Out
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.base,
    paddingTop: spacing.xs,
  },
  greeting: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  driverName: {
    fontFamily: fontFamilies.headlineBold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.onSurface,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  statusBadgePending: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  statusBadgeApproved: {
    backgroundColor: colors.secondaryContainer,
  },
  statusBadgeText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  statusBadgeTextPending: {
    color: colors.onSurfaceVariant,
  },
  statusBadgeTextApproved: {
    color: colors.onSecondaryContainer,
  },
  pendingNotice: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.base,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
  },
  pendingNoticeText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.onSurface,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  routeCardLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  loadingText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    color: colors.outline,
  },
  routeCardActive: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  routeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  routeActiveDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    backgroundColor: colors.secondary,
  },
  routeActiveTitle: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    color: colors.onSurface,
  },
  routeActiveDescription: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.md,
  },
  manageRouteBtn: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.secondaryContainer,
    borderRadius: radii.sm,
  },
  manageRouteBtnText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 13,
    color: colors.onSecondaryContainer,
  },
  routeCardUnset: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    borderStyle: "dashed",
  },
  routeUnsetEmoji: {
    fontSize: 20,
  },
  routeUnsetTitle: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    color: colors.onSurface,
  },
  routeUnsetDescription: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.base,
  },
  vehicleCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  vehicleName: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 15,
    color: colors.onSurface,
    marginBottom: 4,
  },
  vehiclePlate: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    color: colors.outline,
  },
  footerSection: {
    marginTop: spacing.md,
  },
});

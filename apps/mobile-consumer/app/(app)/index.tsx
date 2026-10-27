/**
 * Consumer Home Shell.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Button,
  Card,
  useAuthStore,
  colors,
  spacing,
  typography,
} from "@routeride/ui";
import { ScreenHeader } from "../../src/components/common/ScreenHeader";

export default function ConsumerHomeScreen() {
  const { user, logout } = useAuthStore();

  return (
    <View style={styles.root}>
      <ScreenHeader title="RouteRide" testID="home-header" />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.container}>
          <Text style={styles.title}>RouteRide Passenger</Text>
        <Text style={styles.subtitle}>
          Logged in as: {user?.fullName || user?.phone || "Passenger"}
        </Text>

        <Card style={styles.searchCard}>
          <Text style={styles.searchTitle}>Daily Commute Matching</Text>
          <Text style={styles.searchSubtitle}>
            Find trusted, background-checked recurring drivers for school or office routes.
          </Text>
          <Button
            variant="primary"
            role="consumer"
            onPress={() => router.push("/(app)/search" as never)}
            accessibilityLabel="Search Routes and Find Drivers"
            testID="search-drivers-button"
            style={styles.searchBtn}
          >
            Find Drivers
          </Button>
        </Card>

        <Button
          variant="secondary"
          role="consumer"
          onPress={() => logout()}
          accessibilityLabel="Log out"
          style={styles.logoutBtn}
        >
          Log out
        </Button>
      </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  container: {
    flex: 1,
    padding: spacing.base,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    ...typography.headlineMd,
    color: colors.onBackground,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
  },
  searchCard: {
    alignSelf: "stretch",
    padding: spacing.base,
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: colors.outlineVariant,
    marginVertical: spacing.sm,
  },
  searchTitle: {
    ...typography.headlineMd,
    fontSize: 16,
    lineHeight: 22,
    color: colors.onSurface,
  },
  searchSubtitle: {
    ...typography.bodyMd,
    fontSize: 13,
    lineHeight: 18,
    color: colors.onSurfaceVariant,
  },
  searchBtn: {
    marginTop: spacing.xs,
  },
  logoutBtn: {
    marginTop: spacing.md,
    alignSelf: "stretch",
  },
});

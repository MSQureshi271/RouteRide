/**
 * Driver Dashboard Shell.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  useAuthStore,
  colors,
  spacing,
  typography,
} from "@routeride/ui";

export default function DriverHomeScreen() {
  const { user, logout } = useAuthStore();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>RouteRide Driver</Text>
        <Text style={styles.subtitle}>
          Logged in as: {user?.fullName || user?.phone || "Driver"}
        </Text>

        <Button
          variant="secondary"
          role="driver"
          onPress={() => logout()}
          accessibilityLabel="Log out"
          style={styles.logoutBtn}
        >
          Log out
        </Button>
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
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    ...typography.headlineMd,
    color: colors.secondary,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
  },
  logoutBtn: {
    marginTop: spacing.lg,
    alignSelf: "stretch",
  },
});

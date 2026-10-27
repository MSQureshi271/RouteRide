import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { DriverDiscoveryResultV2 } from "@routeride/contracts";
import { colors, spacing, radii, typography } from "../tokens";

export interface DriverCardProps {
  driver: DriverDiscoveryResultV2;
  scheduleLabel: string;
  onReview: () => void;
}

/** Discovery is advisory: reviewing a driver never reserves transportation. */
export function DriverCard({
  driver,
  scheduleLabel,
  onReview,
}: DriverCardProps) {
  const price = (driver.monthlyPriceCents / 100).toLocaleString("en-PK", {
    minimumFractionDigits: driver.monthlyPriceCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar} accessible={false}>
          <Text style={styles.initial}>
            {driver.driverName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.identity}>
          <Text style={styles.name} accessibilityRole="header">
            {driver.driverName}
          </Text>
          <Text style={styles.detail}>
            {driver.vehicleColour} {driver.vehicleMake} {driver.vehicleModel}
          </Text>
        </View>
      </View>
      <Text style={styles.value}>
        {driver.avgRating === null
          ? "New driver"
          : `${driver.avgRating.toFixed(1)} (${driver.reviewCount} ${driver.reviewCount === 1 ? "review" : "reviews"})`}
      </Text>
      <Text style={styles.detail}>Available {scheduleLabel}</Text>
      {driver.routeState === "UNSET" ? (
        <Text style={styles.value}>No established route</Text>
      ) : (
        <View style={styles.distances}>
          <View style={styles.identity}>
            <Text style={styles.label}>PICKUP TO ROUTE</Text>
            <Text style={styles.value}>
              {driver.pickupDistanceMeters === null
                ? "Distance unavailable"
                : `${Math.round(driver.pickupDistanceMeters)}m to route`}
            </Text>
          </View>
          <View style={styles.identity}>
            <Text style={styles.label}>DESTINATION TO ROUTE</Text>
            <Text style={styles.value}>
              {driver.destDistanceMeters === null
                ? "Distance unavailable"
                : `${Math.round(driver.destDistanceMeters)}m to route`}
            </Text>
          </View>
        </View>
      )}
      <Text style={styles.detail}>
        Route distances are geographic estimates. Driver approval and timing
        checks are required.
      </Text>
      <View style={styles.distances}>
        <Text style={styles.price}>
          {driver.currency} {price} / month
        </Text>
        <Text style={styles.value}>
          {driver.availableSeats}{" "}
          {driver.availableSeats === 1 ? "seat" : "seats"} available
        </Text>
      </View>
      <Text style={styles.detail}>
        {driver.reviewStatus === "REQUIRED"
          ? "Driver review required"
          : "Available to request"}
      </Text>
      <TouchableOpacity
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={`Review ${driver.driverName}`}
        accessibilityHint="Opens commute details for review. No request is sent."
        onPress={onReview}
      >
        <Text style={styles.buttonText}>Review driver</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { color: colors.onPrimary, fontSize: 18, fontWeight: "700" },
  identity: { flex: 1 },
  name: { ...typography.headlineMd, fontSize: 16, color: colors.onSurface },
  label: { ...typography.labelCaps, color: colors.onSurfaceVariant },
  detail: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  value: { ...typography.bodyMd, color: colors.onSurface, fontWeight: "600" },
  price: { ...typography.bodyMd, color: colors.primary, fontWeight: "700" },
  distances: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  button: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    padding: spacing.sm,
  },
  buttonText: {
    ...typography.bodyMd,
    color: colors.onPrimary,
    fontWeight: "700",
  },
});

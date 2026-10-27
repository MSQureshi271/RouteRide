import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, Badge, colors, spacing, typography, radii } from "@routeride/ui";
import type { Rider } from "@routeride/contracts";

export interface CorridorCardProps {
  rider: Rider;
}

export function CorridorCard({ rider }: CorridorCardProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>Commute Corridor</Text>
        <Badge variant="neutral" label="Rider Profile" />
      </View>

      <Card style={styles.card}>
        {/* Pickup Row */}
        <View style={styles.pointRow}>
          <View style={[styles.dot, styles.pickupDot]}>
            <Text style={styles.dotIcon}>🏠</Text>
          </View>
          <View style={styles.pointTextContainer}>
            <Text style={styles.pointType}>Pickup Location</Text>
            <Text
              style={styles.addressText}
              numberOfLines={2}
              testID="corridor-pickup-address"
              accessibilityLabel={`Pickup location: ${rider.homeAddressText}`}
            >
              {rider.homeAddressText}
            </Text>
          </View>
        </View>

        {/* Divider / Route path line */}
        <View style={styles.connectorContainer}>
          <View style={styles.connectorLine} />
        </View>

        {/* Destination Row */}
        <View style={styles.pointRow}>
          <View style={[styles.dot, styles.destDot]}>
            <Text style={styles.dotIcon}>🏫</Text>
          </View>
          <View style={styles.pointTextContainer}>
            <Text style={styles.pointType}>Destination</Text>
            <Text
              style={styles.addressText}
              numberOfLines={2}
              testID="corridor-dest-address"
              accessibilityLabel={`Destination location: ${rider.destAddressText}`}
            >
              {rider.destAddressText}
            </Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionLabel: {
    ...typography.bodyMd,
    fontFamily: "Manrope-SemiBold",
    color: colors.onSurface,
  },
  card: {
    padding: spacing.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: colors.outlineVariant,
    borderRadius: radii.md,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainerHigh,
  },
  pickupDot: {
    backgroundColor: colors.surfaceContainerLow,
  },
  destDot: {
    backgroundColor: colors.surfaceContainerHighest,
  },
  dotIcon: {
    fontSize: 16,
  },
  pointTextContainer: {
    flex: 1,
  },
  pointType: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: colors.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addressText: {
    ...typography.bodyMd,
    fontWeight: "500",
    color: colors.onSurface,
    marginTop: 2,
  },
  connectorContainer: {
    paddingLeft: 15,
    marginVertical: 4,
  },
  connectorLine: {
    width: 2,
    height: 16,
    backgroundColor: colors.outlineVariant,
  },
});

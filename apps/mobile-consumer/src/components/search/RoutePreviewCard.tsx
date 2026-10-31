import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, radii, typography } from "@routeride/ui";
import type { Rider } from "@routeride/contracts";
import { useRouter } from "expo-router";

export interface RoutePreviewCardProps {
  rider: Rider | null;
  onEditPress?: () => void;
}

export function RoutePreviewCard({
  rider,
  onEditPress,
}: RoutePreviewCardProps) {
  const router = useRouter();

  const handleEdit = () => {
    if (onEditPress) {
      onEditPress();
    } else if (rider) {
      router.push("/(app)/riders");
    }
  };

  return (
    <View style={styles.card} testID="route-preview-card">
      <Text style={styles.cardTitle}>Route Preview</Text>
      <View style={styles.divider} />

      <View style={styles.preview}>
        <View style={styles.corridorContainer}>
          <View
            style={styles.timelineColumn}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={styles.originDot} />
            <View style={styles.timelineLine} />
            <View style={styles.destinationDot} />
          </View>

          {/* Address Texts Column */}
          <View style={styles.addressColumn}>
            <View style={styles.addressBlock}>
              <Text
                style={styles.addressText}
                numberOfLines={1}
                ellipsizeMode="tail"
                accessibilityLabel={`Pickup: ${rider?.homeAddressText ?? "Location not set"}`}
                testID="route-preview-pickup"
              >
                {rider?.homeAddressText ?? "Pickup location not set"}
              </Text>
            </View>

            <View style={styles.addressBlock}>
              <Text
                style={styles.addressText}
                numberOfLines={1}
                ellipsizeMode="tail"
                accessibilityLabel={`Drop-off: ${rider?.destAddressText ?? "Location not set"}`}
                testID="route-preview-dest"
              >
                {rider?.destAddressText ?? "Destination not set"}
              </Text>
            </View>
          </View>
        </View>

        {/* Edit Action Link */}
        <View style={styles.footerRow}>
          <TouchableOpacity
            onPress={handleEdit}
            style={styles.editButton}
            accessibilityRole="button"
            accessibilityLabel="Edit route addresses"
            testID="route-preview-edit-btn"
            hitSlop={8}
          >
            <Text style={styles.editIcon}>✏️</Text>
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.surfaceDim,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typography.headlineMd,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceDim,
    marginHorizontal: spacing.xs,
  },
  preview: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  corridorContainer: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  timelineColumn: {
    width: 32,
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  originDot: {
    width: 12,
    height: 12,
    borderRadius: radii.full,
    backgroundColor: colors.routeBlue,
  },
  timelineLine: {
    flex: 1,
    minHeight: 24,
    width: 2,
    backgroundColor: colors.routeBlue,
  },
  destinationDot: {
    width: 12,
    height: 12,
    borderRadius: radii.full,
    backgroundColor: colors.onSurface,
  },
  addressColumn: {
    flex: 1,
    gap: spacing.md,
  },
  addressBlock: {
    justifyContent: "center",
    minHeight: 20,
  },
  addressText: {
    ...typography.bodyMd,
    fontWeight: "600",
    color: colors.onSurface,
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.xs,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  editIcon: {
    fontSize: 12,
  },
  editText: {
    ...typography.bodyMd,
    fontSize: 13,
    fontWeight: "600",
    color: colors.routeBlue,
  },
});

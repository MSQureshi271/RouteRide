import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, radii, typography } from "@routeride/ui";
import type { Rider } from "@routeride/contracts";
import { useRouter } from "expo-router";

export interface RoutePreviewCardProps {
  rider: Rider | null;
  onEditPress?: () => void;
}

export function RoutePreviewCard({ rider, onEditPress }: RoutePreviewCardProps) {
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

      <View style={styles.corridorContainer}>
        {/* Timeline Indicator Column */}
        <View style={styles.timelineColumn}>
          <View style={styles.originRing}>
            <View style={styles.originInner} />
          </View>
          <View style={styles.dottedLine}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <View style={styles.destIconContainer}>
            <Text style={styles.destEmoji}>🗺️</Text>
          </View>
        </View>

        {/* Address Texts Column */}
        <View style={styles.addressColumn}>
          <View style={styles.addressBlock}>
            <Text
              style={styles.addressText}
              numberOfLines={2}
              testID="route-preview-pickup"
            >
              {rider?.homeAddressText ?? "Pickup location not set"}
            </Text>
          </View>

          <View style={styles.addressBlock}>
            <Text
              style={styles.addressText}
              numberOfLines={2}
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
          accessibilityLabel="Edit corridor addresses"
          testID="route-preview-edit-btn"
          hitSlop={8}
        >
          <Text style={styles.editIcon}>✏️</Text>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>
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
    marginBottom: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardTitle: {
    ...typography.headlineMd,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.md,
  },
  corridorContainer: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  timelineColumn: {
    width: 28,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  originRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: "center",
    justifyContent: "center",
  },
  originInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceContainerLowest,
  },
  dottedLine: {
    flex: 1,
    justifyContent: "space-evenly",
    alignItems: "center",
    marginVertical: 4,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.outlineVariant,
  },
  destIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: "center",
    justifyContent: "center",
  },
  destEmoji: {
    fontSize: 14,
  },
  addressColumn: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 0,
    gap: spacing.md,
  },
  addressBlock: {
    justifyContent: "center",
    minHeight: 28,
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
    color: colors.onSurfaceVariant,
  },
});

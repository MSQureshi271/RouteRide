import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, typography, radii } from "@routeride/ui";

export type SubscriptionType = "ONE_WAY" | "ROUND_TRIP";

export interface SubscriptionTypePickerProps {
  selectedType: SubscriptionType;
  onSelectType: (type: SubscriptionType) => void;
}

const TYPES: { type: SubscriptionType; label: string; icon: string; accessibilityLabel: string }[] = [
  { type: "ONE_WAY", label: "One-Way", icon: "➡️", accessibilityLabel: "One-way commute" },
  { type: "ROUND_TRIP", label: "Round Trip", icon: "🔄", accessibilityLabel: "Round trip with departure and pickup times" },
];

export function SubscriptionTypePicker({
  selectedType,
  onSelectType,
}: SubscriptionTypePickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Subscription Type</Text>
      <View style={styles.segmentedContainer}>
        {TYPES.map((item) => {
          const isSelected = item.type === selectedType;
          return (
            <TouchableOpacity
              key={item.type}
              style={[styles.segment, isSelected && styles.segmentSelected]}
              onPress={() => onSelectType(item.type)}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel}
              accessibilityState={{ selected: isSelected }}
              testID={`subscription-type-${item.type}`}
              activeOpacity={0.8}
            >
              <Text style={styles.icon}>{item.icon}</Text>
              <Text
                style={[
                  styles.segmentText,
                  isSelected && styles.segmentTextSelected,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.bodyMd,
    fontFamily: "Manrope-SemiBold",
    color: colors.onSurface,
  },
  segmentedContainer: {
    flexDirection: "row",
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
    paddingVertical: spacing.xs,
    paddingHorizontal: 2,
    borderRadius: radii.sm,
  },
  segmentSelected: {
    backgroundColor: colors.surfaceContainerLowest,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  icon: {
    fontSize: 14,
  },
  segmentText: {
    ...typography.bodyMd,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: colors.onSurfaceVariant,
  },
  segmentTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
});

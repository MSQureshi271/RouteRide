import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, typography } from "@routeride/ui";
import { formatTimeDisplay } from "./timeUtils";

export interface TimePickerRowProps {
  label: string;
  time24: string;
  onPress: () => void;
  testID?: string;
}

export function TimePickerRow({
  label,
  time24,
  onPress,
  testID,
}: TimePickerRowProps) {
  const displayTime = formatTimeDisplay(time24);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${displayTime}. Tap to change time.`}
      testID={testID}
      activeOpacity={0.7}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rightGroup}>
        <Text style={styles.valueText}>{displayTime}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  label: {
    ...typography.bodyMd,
    fontSize: 15,
    fontWeight: "600",
    color: colors.onSurface,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  valueText: {
    ...typography.bodyMd,
    fontSize: 15,
    fontWeight: "600",
    color: colors.onSurface,
  },
  chevron: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.onSurfaceVariant,
    marginLeft: 2,
    lineHeight: 20,
  },
});

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, typography, radii } from "@routeride/ui";

export interface DayPickerProps {
  selectedDay: number;
  onSelectDay: (day: number) => void;
}

const DAYS = [
  { dayIndex: 1, label: "Mon", full: "Monday" },
  { dayIndex: 2, label: "Tue", full: "Tuesday" },
  { dayIndex: 3, label: "Wed", full: "Wednesday" },
  { dayIndex: 4, label: "Thu", full: "Thursday" },
  { dayIndex: 5, label: "Fri", full: "Friday" },
  { dayIndex: 6, label: "Sat", full: "Saturday" },
  { dayIndex: 0, label: "Sun", full: "Sunday" },
];

export function DayPicker({ selectedDay, onSelectDay }: DayPickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Commute Day</Text>
      <View style={styles.row}>
        {DAYS.map((d) => {
          const isSelected = d.dayIndex === selectedDay;
          return (
            <TouchableOpacity
              key={d.dayIndex}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelectDay(d.dayIndex)}
              accessibilityRole="button"
              accessibilityLabel={d.full}
              accessibilityState={{ selected: isSelected }}
              testID={`day-chip-${d.dayIndex}`}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {d.label}
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chip: {
    minWidth: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.bodyMd,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: colors.onSurface,
  },
  chipTextSelected: {
    color: colors.onPrimary,
    fontWeight: "700",
  },
});

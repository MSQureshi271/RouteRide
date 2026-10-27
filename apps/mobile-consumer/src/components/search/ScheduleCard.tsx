import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, radii, typography } from "@routeride/ui";
import { TimePickerRow } from "./TimePickerRow";

export type TripType = "ROUND_TRIP" | "ONE_WAY";
export type DayPreset = "WORK" | "WEEKEND" | "CUSTOM";

export interface ScheduleCardProps {
  tripType: TripType;
  onChangeTripType: (type: TripType) => void;
  selectedDays: number[]; // 0=Sun..6=Sat
  onToggleDay: (day: number) => void;
  onSelectPreset: (preset: DayPreset) => void;
  activePreset: DayPreset;
  departureTime24: string;
  pickupTime24: string;
  onOpenDeparturePicker: () => void;
  onOpenPickupPicker: () => void;
}

const DAYS = [
  { index: 0, label: "S", name: "Sunday" },
  { index: 1, label: "M", name: "Monday" },
  { index: 2, label: "T", name: "Tuesday" },
  { index: 3, label: "W", name: "Wednesday" },
  { index: 4, label: "T", name: "Thursday" },
  { index: 5, label: "F", name: "Friday" },
  { index: 6, label: "S", name: "Saturday" },
];

export function ScheduleCard({
  tripType,
  onChangeTripType,
  selectedDays,
  onToggleDay,
  onSelectPreset,
  activePreset,
  departureTime24,
  pickupTime24,
  onOpenDeparturePicker,
  onOpenPickupPicker,
}: ScheduleCardProps) {
  return (
    <View style={styles.card} testID="schedule-card">
      {/* Header: Title + Segmented Pill Toggle */}
      <View style={styles.headerRow}>
        <Text style={styles.cardTitle}>Schedule</Text>

        <View style={styles.tripTypePill}>
          <TouchableOpacity
            style={[
              styles.pillOption,
              tripType === "ROUND_TRIP" && styles.pillOptionActive,
            ]}
            onPress={() => onChangeTripType("ROUND_TRIP")}
            accessibilityRole="button"
            accessibilityState={{ selected: tripType === "ROUND_TRIP" }}
            testID="trip-type-round-trip"
          >
            <Text
              style={[
                styles.pillText,
                tripType === "ROUND_TRIP" && styles.pillTextActive,
              ]}
            >
              Round Trip
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pillOption,
              tripType === "ONE_WAY" && styles.pillOptionActive,
            ]}
            onPress={() => onChangeTripType("ONE_WAY")}
            accessibilityRole="button"
            accessibilityState={{ selected: tripType === "ONE_WAY" }}
            testID="trip-type-one-way"
          >
            <Text
              style={[
                styles.pillText,
                tripType === "ONE_WAY" && styles.pillTextActive,
              ]}
            >
              One-Way
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 7-Day Circular Chips */}
      <View style={styles.daysRow}>
        {DAYS.map((d) => {
          const isSelected = selectedDays.includes(d.index);
          return (
            <TouchableOpacity
              key={d.index}
              style={[styles.dayChip, isSelected && styles.dayChipSelected]}
              onPress={() => onToggleDay(d.index)}
              accessibilityRole="button"
              accessibilityLabel={`${d.name}`}
              accessibilityState={{ selected: isSelected }}
              testID={`day-chip-${d.index}`}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayChipText,
                  isSelected && styles.dayChipTextSelected,
                ]}
              >
                {d.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Preset Tabs: Work | Weekend | Custom */}
      <View style={styles.presetsBar}>
        <TouchableOpacity
          style={[
            styles.presetTab,
            activePreset === "WORK" && styles.presetTabActive,
          ]}
          onPress={() => onSelectPreset("WORK")}
          accessibilityRole="button"
          testID="preset-work"
        >
          <Text
            style={[
              styles.presetTabText,
              activePreset === "WORK" && styles.presetTabTextActive,
            ]}
          >
            Work
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.presetTab,
            activePreset === "WEEKEND" && styles.presetTabActive,
          ]}
          onPress={() => onSelectPreset("WEEKEND")}
          accessibilityRole="button"
          testID="preset-weekend"
        >
          <Text
            style={[
              styles.presetTabText,
              activePreset === "WEEKEND" && styles.presetTabTextActive,
            ]}
          >
            Weekend
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.presetTab,
            activePreset === "CUSTOM" && styles.presetTabActive,
          ]}
          onPress={() => onSelectPreset("CUSTOM")}
          accessibilityRole="button"
          testID="preset-custom"
        >
          <Text
            style={[
              styles.presetTabText,
              activePreset === "CUSTOM" && styles.presetTabTextActive,
            ]}
          >
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      {/* Time Rows */}
      <View style={styles.timesContainer}>
        {tripType === "ROUND_TRIP" ? (
          <>
            <TimePickerRow
              label="Departure Time"
              time24={departureTime24}
              onPress={onOpenDeparturePicker}
              testID="departure-time-row"
            />
            <View style={styles.timeDivider} />
            <TimePickerRow
              label="Pickup Time"
              time24={pickupTime24}
              onPress={onOpenPickupPicker}
              testID="pickup-time-row"
            />
          </>
        ) : (
          <TimePickerRow
            label="Departure Time"
            time24={departureTime24}
            onPress={onOpenDeparturePicker}
            testID="departure-time-row"
          />
        )}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typography.headlineMd,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: colors.onSurface,
  },
  tripTypePill: {
    flexDirection: "row",
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.full,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  pillOption: {
    paddingVertical: 5,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.full,
  },
  pillOptionActive: {
    backgroundColor: "#D8E2FF", // Soft modern blue highlight from reference design
  },
  pillText: {
    ...typography.bodyMd,
    fontSize: 12,
    fontWeight: "600",
    color: colors.onSurfaceVariant,
  },
  pillTextActive: {
    color: "#0B1C30",
    fontWeight: "700",
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipSelected: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  dayChipText: {
    ...typography.bodyMd,
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  dayChipTextSelected: {
    color: "#FFFFFF",
  },
  presetsBar: {
    flexDirection: "row",
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.sm,
    padding: 3,
    marginBottom: spacing.sm,
  },
  presetTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: radii.sm - 2,
  },
  presetTabActive: {
    backgroundColor: "#E0E7FF",
  },
  presetTabText: {
    ...typography.bodyMd,
    fontSize: 13,
    fontWeight: "600",
    color: colors.onSurfaceVariant,
  },
  presetTabTextActive: {
    color: "#0B1C30",
    fontWeight: "700",
  },
  timesContainer: {
    marginTop: spacing.xs,
  },
  timeDivider: {
    height: 1,
    backgroundColor: colors.outlineVariant,
  },
});

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, colors, spacing, typography } from "@routeride/ui";
import type { ServiceAreaDraft, AvailabilityGroup } from "./model";
import {
  formatGroupDays,
  groupAvailability,
  replaceAvailabilityGroup,
  weekdayNames,
} from "./model";
import {
  displayTime,
  fromTime24,
  timeFromDate,
  TimeWheelPicker,
  toTime24,
  type WheelTime,
} from "./TimeWheelPicker";

type Availability = ServiceAreaDraft["availability"];
type Preset = "WORK" | "WEEKEND" | "CUSTOM";
const WORK = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const dayOrder = [0, 1, 2, 3, 4, 5, 6];

export function AvailabilityScheduleEditor({
  availability,
  onChange,
}: {
  availability: Availability;
  onChange: (value: Availability) => void;
}) {
  const [phase, setPhase] = useState<"start" | "end" | "days">("start");
  const [wheel, setWheel] = useState<WheelTime>(() => timeFromDate(new Date()));
  const [wheelKey, setWheelKey] = useState(0);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [days, setDays] = useState<number[]>(WORK);
  const [preset, setPreset] = useState<Preset>("WORK");
  const [editing, setEditing] = useState<AvailabilityGroup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetWheel = (time: WheelTime) => {
    setWheel(time);
    setWheelKey((key) => key + 1);
  };
  const reset = () => {
    setEditing(null);
    setPhase("start");
    setStartTime(null);
    setEndTime(null);
    setDays(WORK);
    setPreset("WORK");
    setError(null);
    resetWheel(timeFromDate(new Date()));
  };
  const confirmStart = () => {
    setStartTime(toTime24(wheel));
    setError(null);
    resetWheel(timeFromDate(new Date()));
    setPhase("end");
  };
  const confirmEnd = () => {
    const end = toTime24(wheel);
    if (!startTime || end <= startTime) {
      setError("End time must be later than start time on the same day.");
      return;
    }
    setEndTime(end);
    setError(null);
    setPhase("days");
  };
  const confirmDays = () => {
    if (!startTime || !endTime) return;
    try {
      onChange(
        replaceAvailabilityGroup(availability, editing, {
          startTime,
          endTime,
          days,
        }),
      );
      reset();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this time range.",
      );
    }
  };
  const selectPreset = (value: Preset) => {
    setPreset(value);
    if (value === "WORK") setDays(WORK);
    if (value === "WEEKEND") setDays(WEEKEND);
  };
  const editGroup = (group: AvailabilityGroup) => {
    setEditing(group);
    setStartTime(null);
    setEndTime(null);
    setDays(group.days);
    setPreset(
      group.days.length === WORK.length &&
        WORK.every((day) => group.days.includes(day))
        ? "WORK"
        : group.days.length === WEEKEND.length &&
            WEEKEND.every((day) => group.days.includes(day))
          ? "WEEKEND"
          : "CUSTOM",
    );
    resetWheel(fromTime24(group.startTime));
    setPhase("start");
    setError(null);
  };

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        Your driving hours
      </Text>
      <Text style={styles.hint}>
        Set a start and end time, then choose the days it applies to. Times are
        in Karachi time; overnight hours need separate days.
      </Text>
      <View style={styles.builder}>
        <Text style={styles.step}>
          {phase === "start"
            ? "1  Start time"
            : phase === "end"
              ? "2  End time"
              : "3  Choose days"}
        </Text>
        {editing && (
          <Text style={styles.hint}>
            Editing {formatGroupDays(editing.days)} ·{" "}
            {displayTime(editing.startTime)}–{displayTime(editing.endTime)}
          </Text>
        )}
        {startTime && (
          <Text style={styles.selection}>
            Start {displayTime(startTime)}
            {endTime ? `     End  ${displayTime(endTime)}` : ""}
          </Text>
        )}
        {phase !== "days" ? (
          <>
            <TimeWheelPicker key={wheelKey} value={wheel} onChange={setWheel} />
            <Button
              accessibilityLabel={
                phase === "start" ? "Confirm start time" : "Confirm end time"
              }
              role="driver"
              onPress={phase === "start" ? confirmStart : confirmEnd}
            >
              {phase === "start" ? "Confirm start time" : "Confirm end time"}
            </Button>
          </>
        ) : (
          <>
            <View style={styles.daysRow}>
              {dayOrder.map((day) => {
                const selected = days.includes(day);
                return (
                  <Pressable
                    key={day}
                    style={[styles.dayChip, selected && styles.dayChipSelected]}
                    onPress={() => {
                      setDays((current) =>
                        current.includes(day)
                          ? current.filter((item) => item !== day)
                          : [...current, day],
                      );
                      setPreset("CUSTOM");
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={weekdayNames[day]}
                    testID={`availability-day-${day}`}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        selected && styles.dayTextSelected,
                      ]}
                    >
                      {weekdayNames[day]?.charAt(0)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.presets}>
              {(["WORK", "WEEKEND", "CUSTOM"] as const).map((value) => (
                <Pressable
                  key={value}
                  style={[
                    styles.preset,
                    preset === value && styles.presetSelected,
                  ]}
                  onPress={() => selectPreset(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: preset === value }}
                  accessibilityLabel={`${value === "WORK" ? "Work" : value === "WEEKEND" ? "Weekend" : "Custom"} days preset`}
                  testID={`availability-preset-${value.toLowerCase()}`}
                >
                  <Text
                    style={[
                      styles.presetText,
                      preset === value && styles.presetTextSelected,
                    ]}
                  >
                    {value === "WORK"
                      ? "Work"
                      : value === "WEEKEND"
                        ? "Weekend"
                        : "Custom"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>
              {days.length
                ? `Applies to ${formatGroupDays(days)}`
                : "Select at least one day."}
            </Text>
            <Button
              accessibilityLabel="Confirm selected days"
              role="driver"
              onPress={confirmDays}
            >
              Confirm days
            </Button>
            <Button
              accessibilityLabel="Change end time"
              role="driver"
              variant="secondary"
              onPress={() => {
                resetWheel(
                  endTime ? fromTime24(endTime) : timeFromDate(new Date()),
                );
                setPhase("end");
              }}
            >
              Change end time
            </Button>
          </>
        )}
        {phase === "end" && (
          <Button
            accessibilityLabel="Change start time"
            role="driver"
            variant="secondary"
            onPress={() => {
              resetWheel(
                startTime ? fromTime24(startTime) : timeFromDate(new Date()),
              );
              setPhase("start");
            }}
          >
            Change start time
          </Button>
        )}
        {editing && (
          <Button
            accessibilityLabel="Cancel schedule edit"
            role="driver"
            variant="secondary"
            onPress={reset}
          >
            Cancel edit
          </Button>
        )}
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Schedule preview
      </Text>
      {availability.length === 0 ? (
        <Text style={styles.hint}>
          No driving hours yet. Add a time range above to continue.
        </Text>
      ) : (
        groupAvailability(availability).map((group) => (
          <View
            key={`${group.startTime}-${group.endTime}`}
            style={styles.preview}
          >
            <View style={styles.previewText}>
              <Text style={styles.previewDays}>
                {formatGroupDays(group.days)}
              </Text>
              <Text style={styles.previewHours}>
                {displayTime(group.startTime)} – {displayTime(group.endTime)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${formatGroupDays(group.days)} ${displayTime(group.startTime)} to ${displayTime(group.endTime)}`}
              onPress={() => editGroup(group)}
              style={styles.previewAction}
            >
              <Text style={styles.actionText}>Edit</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${formatGroupDays(group.days)} ${displayTime(group.startTime)} to ${displayTime(group.endTime)}`}
              onPress={() =>
                onChange(
                  availability.filter(
                    (window) =>
                      !(
                        group.days.includes(window.day) &&
                        window.startTime === group.startTime &&
                        window.endTime === group.endTime
                      ),
                  ),
                )
              }
              style={styles.previewAction}
            >
              <Text style={styles.actionText}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  title: { ...typography.headlineMd, color: colors.onSurface },
  hint: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  builder: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  step: { ...typography.bodyMd, fontWeight: "700", color: colors.onSurface },
  selection: { ...typography.bodyMd, color: colors.onSurface },
  daysRow: { flexDirection: "row", justifyContent: "space-between", gap: 3 },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  dayChipSelected: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  dayText: { ...typography.bodyMd, color: colors.onSurface, fontWeight: "700" },
  dayTextSelected: { color: colors.surfaceContainerLowest },
  presets: {
    flexDirection: "row",
    padding: 3,
    gap: 3,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerLow,
  },
  preset: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 6,
  },
  presetSelected: { backgroundColor: colors.secondary },
  presetText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  presetTextSelected: { color: colors.onSecondary, fontWeight: "700" },
  error: { ...typography.bodyMd, color: colors.error },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: spacing.md,
  },
  previewText: { flex: 1 },
  previewDays: {
    ...typography.bodyMd,
    fontWeight: "700",
    color: colors.onSurface,
  },
  previewHours: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  previewAction: { padding: spacing.xs },
  actionText: {
    ...typography.bodyMd,
    color: colors.secondary,
    fontWeight: "700",
  },
});

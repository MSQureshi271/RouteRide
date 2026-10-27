import React from "react";
import { StyleSheet, Text, View } from "react-native";
import WheelPicker from "@quidone/react-native-wheel-picker";
import { colors, spacing, typography } from "@routeride/ui";

const ROW_HEIGHT = 44;
const hours = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: String(index + 1),
}));
const minutes = Array.from({ length: 60 }, (_, index) => ({
  value: index,
  label: String(index).padStart(2, "0"),
}));
const periods: { value: "AM" | "PM"; label: string }[] = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

export type WheelTime = { hour: number; minute: number; period: "AM" | "PM" };

export function timeFromDate(date: Date): WheelTime {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return { hour: hour % 12 || 12, minute, period: hour < 12 ? "AM" : "PM" };
}

export function toTime24(value: WheelTime): string {
  const hour = (value.hour % 12) + (value.period === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
}

export function fromTime24(value: string): WheelTime {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return { hour: hour % 12 || 12, minute, period: hour < 12 ? "AM" : "PM" };
}

export function displayTime(value: string): string {
  const time = fromTime24(value);
  return `${time.hour}:${String(time.minute).padStart(2, "0")} ${time.period}`;
}

function WheelColumn<T extends string | number>({
  label,
  data,
  selected,
  onSelect,
}: {
  label: string;
  data: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  const selectedIndex = data.findIndex((item) => item.value === selected);
  const adjust = (direction: number) => {
    const next =
      data[Math.max(0, Math.min(data.length - 1, selectedIndex + direction))];
    if (next) onSelect(next.value);
  };
  return (
    <View style={styles.column}>
      <Text style={styles.columnLabel}>{label}</Text>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${label} wheel`}
        accessibilityValue={{ text: data[selectedIndex]?.label }}
        accessibilityActions={[
          { name: "increment", label: `Increase ${label.toLowerCase()}` },
          { name: "decrement", label: `Decrease ${label.toLowerCase()}` },
        ]}
        onAccessibilityAction={(event) =>
          adjust(event.nativeEvent.actionName === "increment" ? 1 : -1)
        }
        style={styles.wheel}
      >
        <WheelPicker
          data={data}
          value={selected}
          testID={`wheel-${label.toLowerCase()}`}
          width="100%"
          itemHeight={ROW_HEIGHT}
          visibleItemCount={5}
          enableScrollByTapOnItem
          renderOverlay={null}
          itemTextStyle={styles.value}
          onValueChanged={({ item }) => onSelect(item.value)}
        />
      </View>
    </View>
  );
}

export function TimeWheelPicker({
  value,
  onChange,
}: {
  value: WheelTime;
  onChange: (value: WheelTime) => void;
}) {
  return (
    <View style={styles.picker} accessibilityLabel="Time picker">
      <View
        pointerEvents="none"
        testID="time-selection-band"
        style={styles.selectionBand}
      />
      <WheelColumn
        label="Hour"
        data={hours}
        selected={value.hour}
        onSelect={(hour) => onChange({ ...value, hour })}
      />
      <View style={styles.colonColumn} pointerEvents="none">
        <Text style={styles.colon}>:</Text>
      </View>
      <WheelColumn
        label="Minute"
        data={minutes}
        selected={value.minute}
        onSelect={(minute) => onChange({ ...value, minute })}
      />
      <WheelColumn
        label="Period"
        data={periods}
        selected={value.period}
        onSelect={(period) => onChange({ ...value, period })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {
    height: 240,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    paddingHorizontal: spacing.sm,
  },
  selectionBand: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    top: 100,
    height: ROW_HEIGHT,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
  },
  column: { flex: 1, alignItems: "center" },
  columnLabel: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    height: 20,
    fontSize: 12,
  },
  wheel: { alignSelf: "stretch" },
  value: { ...typography.bodyMd, color: colors.onSurface, fontSize: 21 },
  colonColumn: {
    height: ROW_HEIGHT * 5.6,
    width: 20,
    alignSelf: "flex-end",
    justifyContent: "center",
    alignItems: "center",
  },
  colon: { ...typography.headlineMd, color: colors.onSurface, fontSize: 27 },
});

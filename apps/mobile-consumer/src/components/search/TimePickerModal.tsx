import React, { useState, useEffect } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, spacing, radii, typography } from "@routeride/ui";
import { to12Hour, to24Hour } from "./timeUtils";

export interface TimePickerModalProps {
  visible: boolean;
  title: string;
  initialTime24: string; // e.g. "08:30"
  onConfirm: (time24: string) => void;
  onCancel: () => void;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export function TimePickerModal({
  visible,
  title,
  initialTime24,
  onConfirm,
  onCancel,
}: TimePickerModalProps) {
  const parsed = to12Hour(initialTime24);
  const [selectedHour, setSelectedHour] = useState(parsed.hour);
  const [selectedMinute, setSelectedMinute] = useState(
    Math.round(parsed.minute / 5) * 5 % 60,
  );
  const [selectedPeriod, setSelectedPeriod] = useState<"AM" | "PM">(parsed.period);

  useEffect(() => {
    if (visible) {
      const p = to12Hour(initialTime24);
      setSelectedHour(p.hour);
      setSelectedMinute(Math.round(p.minute / 5) * 5 % 60);
      setSelectedPeriod(p.period);
    }
  }, [visible, initialTime24]);

  const handleConfirm = () => {
    const time24 = to24Hour(selectedHour, selectedMinute, selectedPeriod);
    onConfirm(time24);
  };

  const previewFormatted = `${String(selectedHour).padStart(2, "0")}:${String(selectedMinute).padStart(2, "0")} ${selectedPeriod}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn} hitSlop={8}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Large Preview */}
          <View style={styles.previewBox}>
            <Text style={styles.previewText} testID="time-picker-preview">
              {previewFormatted}
            </Text>
          </View>

          {/* Selectors Row */}
          <View style={styles.pickersRow}>
            {/* Hours Column */}
            <View style={styles.columnContainer}>
              <Text style={styles.columnLabel}>HOUR</Text>
              <ScrollView
                style={styles.wheelList}
                showsVerticalScrollIndicator={false}
              >
                {HOURS.map((h) => {
                  const isSelected = h === selectedHour;
                  return (
                    <TouchableOpacity
                      key={h}
                      style={[
                        styles.pickerItem,
                        isSelected && styles.pickerItemSelected,
                      ]}
                      onPress={() => setSelectedHour(h)}
                      testID={`time-picker-hour-${h}`}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextSelected,
                        ]}
                      >
                        {String(h).padStart(2, "0")}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Minutes Column */}
            <View style={styles.columnContainer}>
              <Text style={styles.columnLabel}>MINUTE</Text>
              <ScrollView
                style={styles.wheelList}
                showsVerticalScrollIndicator={false}
              >
                {MINUTES.map((m) => {
                  const isSelected = m === selectedMinute;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.pickerItem,
                        isSelected && styles.pickerItemSelected,
                      ]}
                      onPress={() => setSelectedMinute(m)}
                      testID={`time-picker-minute-${m}`}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextSelected,
                        ]}
                      >
                        {String(m).padStart(2, "0")}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* AM / PM Column */}
            <View style={styles.columnContainer}>
              <Text style={styles.columnLabel}>PERIOD</Text>
              <View style={styles.periodCol}>
                <TouchableOpacity
                  style={[
                    styles.periodBtn,
                    selectedPeriod === "AM" && styles.periodBtnSelected,
                  ]}
                  onPress={() => setSelectedPeriod("AM")}
                  testID="time-picker-period-am"
                >
                  <Text
                    style={[
                      styles.periodBtnText,
                      selectedPeriod === "AM" && styles.periodBtnTextSelected,
                    ]}
                  >
                    AM
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.periodBtn,
                    selectedPeriod === "PM" && styles.periodBtnSelected,
                  ]}
                  onPress={() => setSelectedPeriod("PM")}
                  testID="time-picker-period-pm"
                >
                  <Text
                    style={[
                      styles.periodBtnText,
                      selectedPeriod === "PM" && styles.periodBtnTextSelected,
                    ]}
                  >
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirm}
              accessibilityRole="button"
              testID="time-picker-confirm-btn"
            >
              <Text style={styles.confirmBtnText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  title: {
    ...typography.headlineMd,
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: 18,
    color: colors.onSurfaceVariant,
    fontWeight: "600",
  },
  previewBox: {
    backgroundColor: colors.surfaceContainerLow,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  previewText: {
    ...typography.headlineMd,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
  },
  pickersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    height: 180,
    marginBottom: spacing.lg,
  },
  columnContainer: {
    flex: 1,
    alignItems: "center",
  },
  columnLabel: {
    ...typography.labelCaps,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.xs,
  },
  wheelList: {
    width: "100%",
  },
  pickerItem: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    alignItems: "center",
    marginBottom: 4,
  },
  pickerItemSelected: {
    backgroundColor: colors.primary,
  },
  pickerItemText: {
    ...typography.bodyMd,
    fontSize: 16,
    fontWeight: "600",
    color: colors.onSurface,
  },
  pickerItemTextSelected: {
    color: colors.onPrimary,
    fontWeight: "700",
  },
  periodCol: {
    width: "100%",
    gap: spacing.sm,
    justifyContent: "center",
    flex: 1,
  },
  periodBtn: {
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  periodBtnSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodBtnText: {
    ...typography.bodyMd,
    fontWeight: "700",
    color: colors.onSurface,
  },
  periodBtnTextSelected: {
    color: colors.onPrimary,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLow,
  },
  cancelBtnText: {
    ...typography.bodyMd,
    fontWeight: "700",
    color: colors.onSurfaceVariant,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  confirmBtnText: {
    ...typography.bodyMd,
    fontWeight: "700",
    color: colors.onPrimary,
  },
});

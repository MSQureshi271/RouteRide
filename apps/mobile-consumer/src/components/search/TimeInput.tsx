import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Input, colors, spacing, typography, radii } from "@routeride/ui";

export interface TimeInputProps {
  label: string;
  inputId: string;
  value: string;
  onChangeText: (val: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  presets?: string[] | undefined;
}

export function TimeInput({
  label,
  inputId,
  value,
  onChangeText,
  error,
  hint,
  presets = [],
}: TimeInputProps) {
  return (
    <View style={styles.container}>
      <Input
        label={label}
        inputId={inputId}
        value={value}
        onChangeText={onChangeText}
        placeholder="HH:mm (e.g. 07:30)"
        error={error}
        hint={hint}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        autoCapitalize="none"
        autoCorrect={false}
        testID={inputId}
      />

      {presets.length > 0 && (
        <View style={styles.presetsRow}>
          <Text style={styles.presetsLabel}>Quick presets:</Text>
          <View style={styles.chipsRow}>
            {presets.map((preset) => {
              const isSelected = value === preset;
              return (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                  onPress={() => onChangeText(preset)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select time ${preset}`}
                  testID={`${inputId}-preset-${preset}`}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.presetText,
                      isSelected && styles.presetTextSelected,
                    ]}
                  >
                    {preset}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  presetsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: -spacing.xs,
  },
  presetsLabel: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    color: colors.onSurfaceVariant,
  },
  chipsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  presetChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  presetChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetText: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: colors.onSurface,
  },
  presetTextSelected: {
    color: colors.onPrimary,
  },
});

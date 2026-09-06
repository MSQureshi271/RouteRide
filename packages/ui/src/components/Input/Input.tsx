/**
 * Input component
 *
 * Wraps a label + native TextInput + error message into one accessible unit.
 * The label is programmatically associated with the input via nativeID/accessibilityLabelledBy.
 *
 * Variants:
 *  - default:  Standard text input
 *  - phone:    E.164 phone with numeric keyboard and +country prefix slot
 *  - password: Secure entry with show/hide toggle
 *
 * Accessibility:
 *  - Error message announced via accessibilityLiveRegion="polite"
 *  - Input aria-invalid="true" when error is present
 *  - Password toggle aria-label switches between "Show password" / "Hide password"
 */
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { colors, radii, spacing, typography } from "../../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InputVariant = "default" | "phone" | "password";

export interface InputProps extends Omit<TextInputProps, "style"> {
  /** Human-readable label rendered above the input. */
  label: string;
  /** Unique ID used to associate the label and input for accessibility. */
  inputId: string;
  /** Validation error message. Shown in red below the input. */
  error?: string | undefined;
  /** Optional helper text shown below the input (hidden when error is present). */
  hint?: string | undefined;
  variant?: InputVariant | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Input({
  label,
  inputId,
  error,
  hint,
  variant = "default",
  ...rest
}: InputProps) {
  const [secureVisible, setSecureVisible] = useState(false);
  const labelId = `${inputId}-label`;
  const errorId = `${inputId}-error`;

  const isPassword = variant === "password";
  const isPhone = variant === "phone";

  return (
    <View style={styles.container}>
      {/* Label */}
      <Text
        nativeID={labelId}
        style={styles.label}
        accessibilityElementsHidden={false}
      >
        {label}
      </Text>

      {/* Input row */}
      <View
        style={[
          styles.inputRow,
          error ? styles.inputRowError : styles.inputRowDefault,
        ]}
      >
        {/* Phone prefix slot */}
        {isPhone && (
          <View style={styles.phonePrefix} accessibilityElementsHidden>
            <Text style={styles.phonePrefixText}>🌐 +</Text>
          </View>
        )}

        <TextInput
          {...rest}
          nativeID={inputId}
          aria-labelledby={labelId}
          accessibilityLabel={label}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          keyboardType={isPhone ? "phone-pad" : rest.keyboardType}
          secureTextEntry={isPassword && !secureVisible}
          style={[styles.input, isPhone && styles.inputPhone]}
          placeholderTextColor={colors.outline}
          selectionColor={colors.routeBlue}
        />

        {/* Password toggle */}
        {isPassword && (
          <Pressable
            onPress={() => setSecureVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={
              secureVisible ? "Hide password" : "Show password"
            }
            style={styles.passwordToggle}
            hitSlop={8}
          >
            <Text style={styles.passwordToggleText}>
              {secureVisible ? "🙈" : "👁"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Error or hint */}
      {error ? (
        <Text
          nativeID={errorId}
          style={styles.errorText}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.bodyMd,
    fontFamily: "Inter-SemiBold",
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.surfaceContainerLowest,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  inputRowDefault: {
    borderColor: colors.outline,
  },
  inputRowError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    ...typography.bodyLg,
    color: colors.onSurface,
    padding: 0,
  },
  inputPhone: {
    marginLeft: spacing.xs,
  },
  phonePrefix: {
    paddingRight: spacing.xs,
  },
  phonePrefixText: {
    ...typography.bodyLg,
    color: colors.onSurfaceVariant,
  },
  passwordToggle: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  passwordToggleText: {
    fontSize: 18,
  },
  errorText: {
    ...typography.bodyMd,
    color: colors.error,
  },
  hintText: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
  },
});

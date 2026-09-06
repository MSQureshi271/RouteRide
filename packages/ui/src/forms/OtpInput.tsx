/**
 * OtpInput — 6-segment OTP entry component.
 *
 * Design:
 *  - Six individual boxes, each accepting exactly one digit
 *  - JetBrains Mono font for digit alignment (data-mono from DESIGN.md)
 *  - Focus auto-advances to the next box on entry
 *  - Backspace moves focus back and clears the previous box
 *  - Paste support: pastes all 6 digits at once
 *
 * Accessibility:
 *  - Single accessible element announcing the combined value
 *  - Each box has a numeric keyboard
 *  - The whole component's accessibilityLabel changes as digits are entered
 */
import React, { useRef } from "react";
import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from "react-native";
import { colors, radii, spacing, typography } from "../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OtpInputProps {
  length?: number | undefined;
  value: string;
  onChange: (value: string) => void;
  /** Shown in red below the boxes when the attempt count is known. */
  attemptsRemaining?: number | undefined;
  /** If true, the input is locked (lockout period active). */
  locked?: boolean | undefined;
  /** Lockout remaining seconds to display. */
  lockoutSeconds?: number | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OtpInput({
  length = 6,
  value,
  onChange,
  attemptsRemaining,
  locked = false,
  lockoutSeconds,
}: OtpInputProps) {
  const digits = value.split("").slice(0, length);
  while (digits.length < length) digits.push("");

  const refs = useRef<(TextInput | null)[]>([]);

  function handleChange(text: string, index: number) {
    // Handle paste of full code
    const cleaned = text.replace(/\D/g, "").slice(0, length);
    if (cleaned.length === length) {
      onChange(cleaned);
      refs.current[length - 1]?.blur();
      return;
    }

    // Single digit entry
    const singleDigit = text.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = singleDigit;
    onChange(next.join(""));

    if (singleDigit && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) {
    if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = "";
      onChange(next.join(""));
      refs.current[index - 1]?.focus();
    }
  }

  const filledCount = digits.filter(Boolean).length;

  return (
    <View
      accessible
      accessibilityLabel={`OTP entry. ${filledCount} of ${length} digits entered.`}
    >
      {/* Digit boxes */}
      <View style={styles.row}>
        {digits.map((digit, i) => (
          <TextInput
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={digit}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={(e) => handleKeyPress(e, i)}
            keyboardType="number-pad"
            maxLength={length} // allow paste
            editable={!locked}
            selectTextOnFocus
            style={[
              styles.box,
              digit ? styles.boxFilled : styles.boxEmpty,
              locked && styles.boxLocked,
            ]}
            accessibilityLabel={`Digit ${i + 1}`}
            accessibilityElementsHidden={false}
          />
        ))}
      </View>

      {/* Status line */}
      {locked ? (
        <Text style={styles.lockoutText}>
          Too many attempts.{" "}
          {lockoutSeconds != null
            ? `Try again in ${lockoutSeconds}s.`
            : "Please wait."}
        </Text>
      ) : attemptsRemaining != null && attemptsRemaining < 3 ? (
        <Text style={styles.attemptsText}>
          {attemptsRemaining} {attemptsRemaining === 1 ? "attempt" : "attempts"}{" "}
          remaining
        </Text>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  box: {
    width: 48,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    textAlign: "center",
    ...typography.dataMono,
    fontSize: 22,
    color: colors.onSurface,
  },
  boxEmpty: {
    borderColor: colors.outline,
    backgroundColor: colors.surfaceContainerLowest,
  },
  boxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerLow,
  },
  boxLocked: {
    backgroundColor: colors.errorContainer,
    borderColor: colors.error,
  },
  attemptsText: {
    ...typography.bodyMd,
    color: colors.error,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  lockoutText: {
    ...typography.bodyMd,
    color: colors.error,
    textAlign: "center",
    marginTop: spacing.sm,
    fontFamily: "Inter-SemiBold",
  },
});

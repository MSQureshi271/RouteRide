/**
 * ErrorState component
 *
 * Shown when a data fetch or action fails unrecoverably.
 * Always provides a retry action.
 *
 * Accessibility: role="alert" triggers immediate announcement by screen readers.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../Button/Button";
import { colors, spacing, typography } from "../../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ErrorStateProps {
  /** Human-readable error message. Never expose raw network errors or stack traces. */
  message: string;
  /** Called when the user taps Retry. */
  onRetry?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessible
      accessibilityLabel={`Error: ${message}`}
    >
      <Text style={styles.icon} accessibilityElementsHidden>
        ⚠️
      </Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Button
          variant="secondary"
          onPress={onRetry}
          accessibilityLabel="Retry"
          style={styles.retryBtn}
        >
          Try again
        </Button>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  icon: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.bodyLg,
    color: colors.onErrorContainer,
    textAlign: "center",
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  retryBtn: {
    marginTop: spacing.md,
    alignSelf: "stretch",
  },
});

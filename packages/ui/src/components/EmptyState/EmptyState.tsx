/**
 * EmptyState component
 *
 * Shown when a list or page has no content.
 * Never leaves the user looking at a blank screen.
 *
 * Accessibility: role="status" so screen readers announce the empty state.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../Button/Button";
import { colors, spacing, typography } from "../../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  /** Large icon/emoji displayed above the message. */
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Optional CTA button. */
  action?: {
    label: string;
    onPress: () => void;
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.iconSlot} accessibilityElementsHidden>
        {icon}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {action && (
        <Button
          variant="secondary"
          onPress={action.onPress}
          accessibilityLabel={action.label}
          style={styles.actionBtn}
        >
          {action.label}
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
  iconSlot: {
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.headlineMd,
    color: colors.onSurface,
    textAlign: "center",
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  actionBtn: {
    marginTop: spacing.md,
    alignSelf: "stretch",
  },
});

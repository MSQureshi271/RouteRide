/**
 * Badge / Status Chip component
 *
 * Pill-shaped (radii.full) high-contrast status indicators.
 * Colors strictly follow DESIGN.md semantic mapping.
 *
 * Accessibility: uses label-caps typography for text content,
 * accessibilityRole="text" (not interactive).
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BadgeVariant =
  | "success" // Safety Emerald — Picked Up
  | "warning" // Amber — En Route
  | "error" // Error red
  | "neutral" // Surface grey
  | "route" // Route Blue — active GPS
  | "navy"; // Trust Navy — consumer-mode accents

export interface BadgeProps {
  variant: BadgeVariant;
  label: string;
  /** If true, shows a small coloured dot before the label (for inline use). */
  dot?: boolean;
}

// ─── Color map ────────────────────────────────────────────────────────────────

const variantStyles: Record<BadgeVariant, { bg: string; fg: string }> = {
  success: { bg: colors.secondary, fg: colors.onSecondary },
  warning: { bg: colors.statusEnRoute, fg: "#FFFFFF" },
  error: { bg: colors.error, fg: colors.onError },
  neutral: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant },
  route: { bg: colors.routeBlue, fg: "#FFFFFF" },
  navy: { bg: colors.primary, fg: colors.onPrimary },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Badge({ variant, label, dot = false }: BadgeProps) {
  const { bg, fg } = variantStyles[variant];

  return (
    <View
      style={[styles.base, { backgroundColor: bg }]}
      accessibilityRole="text"
      accessible
      accessibilityLabel={label}
    >
      {dot && <View style={[styles.dot, { backgroundColor: fg }]} />}
      <Text style={[styles.label, { color: fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    gap: spacing.xs / 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...typography.labelCaps,
  },
});

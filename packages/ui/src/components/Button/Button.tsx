/**
 * Button component
 *
 * Variants:
 *  - primary:   Solid fill. Consumer = Trust Navy (#000), Driver = Safety Emerald (#006c49)
 *  - secondary: Outlined, 1px border. Use for Cancel / Edit actions.
 *  - ghost:     No border, transparent background. Use for tertiary actions.
 *
 * Constraints from DESIGN.md:
 *  - Minimum height 48px (WCAG 2.5.5 AA touch target)
 *  - Corner radius: radii.md (8px)
 *  - Color: tokens only, no raw hex
 *
 * Accessibility:
 *  - accessibilityRole="button" (default for Pressable in RN 0.64+)
 *  - Disabled state visually distinct AND aria-disabled
 *  - Loading state replaces label with ActivityIndicator, preserves accessible label
 */
import React from "react";
import {
  AccessibilityRole,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "../../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Role context controls which color the primary variant uses.
 * consumer: Trust Navy (#000)
 * driver:   Safety Emerald (#006c49)
 */
export type ButtonRole = "consumer" | "driver";

export interface ButtonProps extends Omit<PressableProps, "style" | "role"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Role context for primary variant color differentiation. */
  role?: ButtonRole;
  /** Display a loading spinner in place of the label. */
  loading?: boolean;
  /** Accessible label required when loading (spinner has no visible text). */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Button({
  variant = "primary",
  size = "md",
  role = "consumer",
  loading = false,
  disabled = false,
  accessibilityLabel,
  style,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const primaryBg = role === "driver" ? colors.secondary : colors.primary;
  const primaryFg = role === "driver" ? colors.onSecondary : colors.onPrimary;
  const primaryBorder = role === "driver" ? colors.secondary : colors.primary;

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      accessibilityRole={"button" as AccessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        variant === "primary" && {
          backgroundColor: isDisabled
            ? colors.surfaceContainerHighest
            : primaryBg,
          borderColor: isDisabled ? colors.outline : primaryBorder,
        },
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? primaryFg : colors.onSurface}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === "primary" && {
              color: isDisabled ? colors.onSurfaceVariant : primaryFg,
            },
            variant === "secondary" && {
              color: isDisabled ? colors.onSurfaceVariant : primaryBg,
            },
            variant === "ghost" && {
              color: isDisabled ? colors.onSurfaceVariant : colors.onSurface,
            },
            size === "sm" && styles.labelSm,
            size === "lg" && styles.labelLg,
          ]}
          numberOfLines={1}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.base,
  },
  // Sizes
  sm: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  md: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.base,
  },
  lg: {
    minHeight: 56,
    paddingHorizontal: spacing.xl,
  },
  // Variants
  secondary: {
    backgroundColor: "transparent",
    borderColor: colors.outline,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  // States
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
  // Labels
  label: {
    ...typography.bodyLg,
    fontFamily: "Inter-SemiBold",
  },
  labelSm: {
    fontSize: 13,
  },
  labelLg: {
    fontSize: 17,
  },
});

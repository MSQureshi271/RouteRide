/**
 * Card component
 *
 * Level 1 elevation from DESIGN.md:
 *  - White background
 *  - 1px border (#E2E8F0 ≈ outlineVariant)
 *  - Soft 4% opacity shadow
 *  - 8px corner radius
 *
 * Variants:
 *  - default:   Standard content card
 *  - discovery: Driver Discovery Card with a circular progress slot (top-right)
 *  - timeline:  Compact timeline item with timestamp | passenger | check-in slots
 */
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radii, shadows, spacing } from "../../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CardVariant = "default" | "discovery" | "timeline";

export interface CardProps {
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /** For discovery cards: the circular overlap indicator slot (top-right) */
  overlapIndicator?: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Card({
  variant = "default",
  style,
  children,
  overlapIndicator,
}: CardProps) {
  return (
    <View
      style={[styles.base, variant === "timeline" && styles.timeline, style]}
    >
      {children}
      {variant === "discovery" && overlapIndicator && (
        <View style={styles.overlapSlot} accessibilityElementsHidden>
          {overlapIndicator}
        </View>
      )}
    </View>
  );
}

// Sub-components for composition

export function CardHeader({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.cardHeader, style]}>{children}</View>;
}

export function CardBody({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.cardBody, style]}>{children}</View>;
}

export function CardFooter({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.cardFooter, style]}>{children}</View>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: "hidden",
    // Level 1 shadow
    ...shadows.card,
  },
  timeline: {
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  overlapSlot: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
  },
  cardHeader: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  cardBody: {
    padding: spacing.base,
  },
  cardFooter: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
  },
});

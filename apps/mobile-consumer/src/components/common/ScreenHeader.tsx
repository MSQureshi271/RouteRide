import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@routeride/ui";

export interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  testID?: string;
  backTestID?: string;
  rightAction?: React.ReactNode;
}

/**
 * ScreenHeader Component.
 *
 * Implements a unified, seamless all-white top header across all app screens,
 * extending the solid white background behind the device status bar via SafeAreaView (edges: ["top"]).
 * Matches the visual design of the Riders stack navigation header.
 */
export function ScreenHeader({
  title,
  onBack,
  backLabel = "← Back",
  testID = "screen-header",
  backTestID = "screen-header-back-btn",
  rightAction,
}: ScreenHeaderProps) {
  return (
    <SafeAreaView edges={["top"]} style={styles.headerSafe} testID={testID}>
      <View style={styles.headerContent}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            testID={backTestID}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backBtnText}>{backLabel}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.sideSlot} />
        )}

        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.sideSlot}>
          {rightAction ?? null}
        </View>
      </View>
      <View style={styles.divider} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerSafe: {
    backgroundColor: colors.surfaceContainerLowest, // Seamless pure white (#FFFFFF)
    zIndex: 10,
  },
  headerContent: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
  },
  sideSlot: {
    minWidth: 70,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  backBtn: {
    minWidth: 70,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
  backBtnText: {
    ...typography.bodyMd,
    color: colors.primary,
    fontWeight: "600",
  },
  headerTitle: {
    ...typography.headlineMd,
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
  },
});

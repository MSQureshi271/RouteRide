import React from "react";
import { StyleSheet, View } from "react-native";
import { Skeleton, colors, spacing, radii } from "@routeride/ui";

/**
 * Shimmering skeleton loader for SearchInputScreen.
 * Renders placeholders matching the form layout during initial rider fetch.
 */
export function SearchInputSkeleton() {
  return (
    <View style={styles.container} testID="search-input-skeleton" accessibilityLabel="Loading search options" accessibilityRole="progressbar">
      {/* Title skeleton */}
      <View style={styles.section}>
        <Skeleton width="60%" height={28} borderRadius={radii.sm} />
        <Skeleton width="90%" height={16} borderRadius={radii.sm} style={styles.subtitle} />
      </View>

      {/* Rider selection pills skeleton */}
      <View style={styles.section}>
        <Skeleton width="35%" height={18} borderRadius={radii.sm} />
        <View style={styles.row}>
          <Skeleton width="48%" height={72} borderRadius={radii.md} />
          <Skeleton width="48%" height={72} borderRadius={radii.md} />
        </View>
      </View>

      {/* Corridor card skeleton */}
      <View style={styles.section}>
        <Skeleton width="40%" height={18} borderRadius={radii.sm} />
        <Skeleton width="100%" height={110} borderRadius={radii.md} />
      </View>

      {/* Day picker skeleton */}
      <View style={styles.section}>
        <Skeleton width="45%" height={18} borderRadius={radii.sm} />
        <View style={styles.daysRow}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} width={42} height={42} borderRadius={radii.full} />
          ))}
        </View>
      </View>

      {/* Time and subscription skeleton */}
      <View style={styles.section}>
        <Skeleton width="50%" height={18} borderRadius={radii.sm} />
        <Skeleton width="100%" height={48} borderRadius={radii.sm} />
      </View>

      {/* Button skeleton */}
      <View style={styles.btnSection}>
        <Skeleton width="100%" height={52} borderRadius={radii.md} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.base,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  section: {
    gap: spacing.xs,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  btnSection: {
    marginTop: spacing.md,
  },
});

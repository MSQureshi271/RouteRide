/**
 * Skeleton loading component
 *
 * Displays a shimmering placeholder during data fetches.
 * Uses Animated.loop + interpolate for a smooth shimmer.
 * Never shows a spinner for content-loading states.
 *
 * Accessibility: aria-busy="true", hidden from screen readers
 * (the meaningful loaded content will be announced when it arrives).
 */
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radii } from "../../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkeletonProps {
  /** Width of the skeleton block. Defaults to '100%'. */
  width?: number | `${number}%` | undefined;
  /** Height of the skeleton block. */
  height: number;
  /** Corner radius override (defaults to radii.sm). */
  borderRadius?: number | undefined;
  style?: ViewStyle | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Skeleton({
  width = "100%",
  height,
  borderRadius = radii.sm,
  style,
}: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.8],
  });

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        { width: width as number, height, borderRadius },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity, backgroundColor: colors.surfaceContainerHigh },
        ]}
      />
    </View>
  );
}

/** Convenience preset: renders N skeleton rows of varying width */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  const widths: `${number}%`[] = ["100%", "75%", "90%", "60%", "80%"];
  return (
    <View style={styles.list} accessible={false} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} height={16} />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceContainerLow,
    overflow: "hidden",
  },
  list: {
    gap: 12,
  },
});

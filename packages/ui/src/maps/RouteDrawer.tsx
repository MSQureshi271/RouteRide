/**
 * RouteDrawer — shared map component for drawing and displaying a route polyline.
 *
 * Used in the driver onboarding wizard (T0.43).
 *
 * Features:
 *  - Tap on the map to add waypoints
 *  - Renders a Polyline connecting all waypoints
 *  - Reports the current polyline via onRouteChange callback
 *  - Shows a clear-all button when waypoints exist
 *  - Validates: minimum 2 distinct waypoints required before confirming
 *
 * Props:
 *  - initialCoords: center the map here on mount (defaults to Karachi)
 *  - onRouteChange: called with the GeoJSON LineString every time points change
 *  - readOnly: if true, renders the polyline but disables adding new points
 */
import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
} from "react-native";
import MapView, { Polyline, MapPressEvent } from "react-native-maps";
import { colors, spacing, typography } from "../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface GeoLineString {
  type: "LineString";
  coordinates: [number, number][]; // [longitude, latitude]
}

export interface RouteDrawerProps {
  /** Initial map center. Defaults to Karachi. */
  initialCoords?: LatLng | undefined;
  /** Fired whenever the waypoints list changes. */
  onRouteChange?: ((route: GeoLineString | null) => void) | undefined;
  /** If true, tapping the map adds no new points. */
  readOnly?: boolean | undefined;
  /** Pre-populated waypoints for resuming progress. */
  initialWaypoints?: LatLng[] | undefined;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KARACHI_CENTER: LatLng = {
  latitude: 24.8607,
  longitude: 67.0011,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RouteDrawer({
  initialCoords = KARACHI_CENTER,
  onRouteChange,
  readOnly = false,
  initialWaypoints = [],
}: RouteDrawerProps) {
  const [waypoints, setWaypoints] = useState<LatLng[]>(initialWaypoints);

  React.useEffect(() => {
    if (initialWaypoints) {
      setWaypoints(initialWaypoints);
    }
  }, [initialWaypoints]);

  const handleMapPress = useCallback(
    (event: MapPressEvent) => {
      if (readOnly) return;
      const coord = event.nativeEvent.coordinate;
      setWaypoints((prev) => {
        const next = [...prev, coord];
        setTimeout(() => {
          if (next.length >= 2) {
            onRouteChange?.({
              type: "LineString",
              coordinates: next.map((p) => [p.longitude, p.latitude]),
            });
          } else {
            onRouteChange?.(null);
          }
        }, 0);
        return next;
      });
    },
    [readOnly, onRouteChange],
  );

  const handleClear = useCallback(() => {
    setWaypoints([]);
    onRouteChange?.(null);
  }, [onRouteChange]);

  const polylineCoords = waypoints.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: initialCoords.latitude,
          longitude: initialCoords.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        onPress={handleMapPress}
        accessibilityLabel="Route map. Tap to add waypoints."
        accessibilityRole="image"
        testID="route-drawer-map"
      >
        {polylineCoords.length >= 2 && (
          <Polyline
            coordinates={polylineCoords}
            strokeColor={colors.secondary}
            strokeWidth={3}
          />
        )}
      </MapView>

      {/* Waypoint count indicator */}
      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.waypointCount}>
          {waypoints.length === 0
            ? "Tap the map to draw your route"
            : `${waypoints.length} waypoint${waypoints.length > 1 ? "s" : ""} — ${waypoints.length < 2 ? "add at least 1 more" : "route ready"}`}
        </Text>
      </View>

      {/* Clear button */}
      {!readOnly && waypoints.length > 0 && (
        <TouchableOpacity
          style={styles.clearButton}
          onPress={handleClear}
          accessibilityLabel="Clear route"
          accessibilityRole="button"
          testID="route-drawer-clear"
        >
          <Text style={styles.clearButtonText}>✕ Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  map: {
    flex: 1,
    minHeight: 280,
  },
  overlay: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  waypointCount: {
    ...typography.bodyMd,
    color: "#FFFFFF",
    textAlign: "center",
  },
  clearButton: {
    position: "absolute",
    bottom: spacing.md,
    right: spacing.md,
    backgroundColor: colors.error,
    borderRadius: 20,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  clearButtonText: {
    ...typography.bodyMd,
    color: colors.onError,
  },
});

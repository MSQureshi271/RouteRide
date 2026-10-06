/**
 * RouteSettingsScreen — "My Route" management screen for drivers.
 *
 * Allows drivers (both PENDING and APPROVED) to search for locations they
 * regularly travel between, arrange stops in order, save the route,
 * and view a live map preview.
 *
 * Flow:
 *  1. Search location via PlaceSearchInput (Google Places proxy).
 *  2. Add stop to ordered list.
 *  3. Move stops up/down or remove.
 *  4. Save route via POST /drivers/me/route/from-locations.
 *  5. On success, show a read-only RouteDrawer map preview.
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  Button,
  PlaceSearchInput,
  LocationDropdown,
  RouteDrawer,
  colors,
  fontFamilies,
  getApiClient,
  radii,
  spacing,
  type LatLng,
  type SelectedLocation,
} from "@routeride/ui";

interface RouteStop {
  id: string;
  address: string;
  lat: number;
  lng: number;
}

export default function RouteSettingsScreen() {
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedWaypoints, setSavedWaypoints] = useState<LatLng[] | null>(null);

  // Load existing route if driver already has one configured
  useEffect(() => {
    let mounted = true;

    async function loadDriverRoute() {
      try {
        const client = getApiClient();
        const response = await client.get<{
          routePolyline?: {
            type: "LineString";
            coordinates: [number, number][];
          };
        }>("/drivers/me");

        if (mounted && response.data?.routePolyline?.coordinates) {
          const coords = response.data.routePolyline.coordinates;
          if (coords.length >= 2) {
            const initialStops: RouteStop[] = coords.map((c, i) => ({
              id: `existing-${i}-${c[0]}-${c[1]}`,
              address: `Stop ${i + 1} (${c[1].toFixed(4)}, ${c[0].toFixed(4)})`,
              lat: c[1],
              lng: c[0],
            }));
            setStops(initialStops);
            setSavedWaypoints(
              coords.map((c) => ({
                latitude: c[1],
                longitude: c[0],
              })),
            );
          }
        }
      } catch {
        // Driver might not have a profile yet or network issue — non-fatal
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    }

    void loadDriverRoute();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLocationSelected = (loc: SelectedLocation) => {
    setServerError(null);
    setSuccessMessage(null);
    const newStop: RouteStop = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      address: loc.address,
      lat: loc.lat,
      lng: loc.lng,
    };
    setStops((prev) => [...prev, newStop]);
  };

  const handleRemoveStop = (index: number) => {
    setServerError(null);
    setSuccessMessage(null);
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveStop = (index: number, direction: "up" | "down") => {
    setServerError(null);
    setSuccessMessage(null);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stops.length) return;

    setStops((prev) => {
      const copy = [...prev];
      const temp = copy[index]!;
      copy[index] = copy[targetIndex]!;
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleSaveRoute = async () => {
    if (stops.length < 2) {
      setServerError("Please add at least 2 locations to form a route.");
      return;
    }

    setSaving(true);
    setServerError(null);
    setSuccessMessage(null);

    try {
      const client = getApiClient();
      await client.post("/drivers/me/route/from-locations", {
        locations: stops.map((s) => ({
          address: s.address,
          lat: s.lat,
          lng: s.lng,
        })),
      });

      const waypoints: LatLng[] = stops.map((s) => ({
        latitude: s.lat,
        longitude: s.lng,
      }));
      setSavedWaypoints(waypoints);
      setSuccessMessage("Your route has been saved successfully!");
    } catch (err: unknown) {
      const resp = (
        err as { response?: { status?: number; data?: { message?: string } } }
      )?.response;
      if (resp?.status === 422) {
        setServerError(
          resp.data?.message ||
            "One or more locations are outside RouteRide's service area (Karachi). Please check your stops.",
        );
      } else if (resp?.status === 400) {
        setServerError(
          "Invalid route data. Please check your stops and try again.",
        );
      } else {
        setServerError(
          "Failed to save route. Please check your internet connection and try again.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>My Daily Route</Text>
          <Text style={styles.subtitle}>
            Enter the stops you regularly drive through. We will use these to
            match you with passengers whose commute overlaps with yours.
          </Text>
        </View>

        {serverError && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorText}>⚠️ {serverError}</Text>
          </View>
        )}

        {successMessage && (
          <View style={styles.successBanner} accessibilityRole="alert">
            <Text style={styles.successText}>✓ {successMessage}</Text>
          </View>
        )}

        {/* Place search input */}
        <View style={styles.searchSection}>
          <PlaceSearchInput
            label="Add Stop to Route"
            placeholder="Search address, landmark, or area in Karachi"
            onLocationSelected={handleLocationSelected}
            testID="route-search-input"
            hint="Type at least 2 characters to search places (e.g. Clifton, Gulshan, Airport)"
          />

          <LocationDropdown
            label="Quick Select Sample Location"
            placeholder="Pick a preset stop (e.g. DHA, Clifton, KGS)"
            onSelect={(loc) => {
              handleLocationSelected({
                placeId: loc.id,
                address: loc.address,
                lat: loc.lat,
                lng: loc.lng,
              });
            }}
            testID="route-dev-location-dropdown"
          />
        </View>

        {/* Stops list */}
        <View style={styles.stopsSection}>
          <View style={styles.stopsHeader}>
            <Text style={styles.stopsSectionTitle}>Stops along Route</Text>
            <View
              style={[
                styles.badge,
                stops.length >= 2 ? styles.badgeSuccess : styles.badgeMuted,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  stops.length >= 2
                    ? styles.badgeTextSuccess
                    : styles.badgeTextMuted,
                ]}
              >
                {stops.length} {stops.length === 1 ? "stop" : "stops"}
              </Text>
            </View>
          </View>

          {loadingInitial ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.secondary} />
              <Text style={styles.loadingText}>Loading existing route...</Text>
            </View>
          ) : stops.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🗺️</Text>
              <Text style={styles.emptyTitle}>No stops added yet</Text>
              <Text style={styles.emptySubtitle}>
                Search and select at least 2 locations above to define where
                your route starts, passes through, and ends.
              </Text>
            </View>
          ) : (
            stops.map((stop, index) => (
              <View
                key={stop.id}
                style={styles.stopCard}
                testID={`stop-card-${index}`}
              >
                <View style={styles.stopIndexBadge}>
                  <Text style={styles.stopIndexText}>{index + 1}</Text>
                </View>

                <View style={styles.stopDetails}>
                  <Text style={styles.stopLabel}>
                    {index === 0
                      ? "Starting Point"
                      : index === stops.length - 1
                        ? "Final Destination"
                        : `Way-stop ${index}`}
                  </Text>
                  <Text style={styles.stopAddress} numberOfLines={2}>
                    {stop.address}
                  </Text>
                </View>

                <View style={styles.reorderControls}>
                  <TouchableOpacity
                    style={[
                      styles.iconBtn,
                      index === 0 && styles.iconBtnDisabled,
                    ]}
                    onPress={() => handleMoveStop(index, "up")}
                    disabled={index === 0}
                    accessibilityLabel={`Move stop ${index + 1} up`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.iconBtnText}>▲</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.iconBtn,
                      index === stops.length - 1 && styles.iconBtnDisabled,
                    ]}
                    onPress={() => handleMoveStop(index, "down")}
                    disabled={index === stops.length - 1}
                    accessibilityLabel={`Move stop ${index + 1} down`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.iconBtnText}>▼</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.iconBtn, styles.removeBtn]}
                    onPress={() => handleRemoveStop(index)}
                    accessibilityLabel={`Remove stop ${index + 1}`}
                    accessibilityRole="button"
                    testID={`remove-stop-${index}`}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Action Button */}
        <View style={styles.actions}>
          <Button
            variant="primary"
            role="driver"
            disabled={stops.length < 2 || saving}
            loading={saving}
            onPress={handleSaveRoute}
            accessibilityLabel="Save Route"
            testID="save-route-button"
          >
            {stops.length < 2
              ? `Add at least ${2 - stops.length} more stop${2 - stops.length === 1 ? "" : "s"}`
              : "Save Route"}
          </Button>
        </View>

        {/* Map Preview */}
        {savedWaypoints && savedWaypoints.length >= 2 && (
          <View style={styles.mapPreviewSection}>
            <Text style={styles.mapPreviewTitle}>Route Preview</Text>
            <Text style={styles.mapPreviewSubtitle}>
              Green polyline connecting your {savedWaypoints.length} saved
              waypoints:
            </Text>
            <View style={styles.mapWrapper}>
              <RouteDrawer
                readOnly
                initialCoords={savedWaypoints[0]}
                initialWaypoints={savedWaypoints}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.base,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  backBtnText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 14,
    color: colors.secondary,
  },
  title: {
    fontFamily: fontFamilies.headlineBold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onSurfaceVariant,
  },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  errorText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    color: colors.onErrorContainer,
  },
  successBanner: {
    backgroundColor: colors.secondaryFixedDim,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  successText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 13,
    color: colors.onSecondaryFixed,
  },
  searchSection: {
    zIndex: 50,
    marginBottom: spacing.sm,
  },
  stopsSection: {
    marginBottom: spacing.lg,
  },
  stopsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  stopsSectionTitle: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    color: colors.onSurface,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  badgeSuccess: {
    backgroundColor: colors.secondaryContainer,
  },
  badgeMuted: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  badgeTextSuccess: {
    color: colors.onSecondaryContainer,
  },
  badgeTextMuted: {
    color: colors.onSurfaceVariant,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  loadingText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 14,
    color: colors.outline,
  },
  emptyState: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderStyle: "dashed",
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    color: colors.outline,
    textAlign: "center",
    lineHeight: 18,
  },
  stopCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  stopIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  stopIndexText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSecondaryContainer,
  },
  stopDetails: {
    flex: 1,
    marginRight: spacing.sm,
  },
  stopLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 11,
    color: colors.secondary,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  stopAddress: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 18,
  },
  reorderControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDisabled: {
    opacity: 0.3,
  },
  iconBtnText: {
    fontSize: 10,
    color: colors.onSurface,
  },
  removeBtn: {
    backgroundColor: colors.errorContainer,
    marginLeft: 4,
  },
  removeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onErrorContainer,
  },
  actions: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  mapPreviewSection: {
    marginTop: spacing.base,
  },
  mapPreviewTitle: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  mapPreviewSubtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    color: colors.outline,
    marginBottom: spacing.sm,
  },
  mapWrapper: {
    height: 280,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
});

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  Button,
  PlaceSearchInput,
  colors,
  getApiClient,
  spacing,
  typography,
} from "@routeride/ui";
import {
  DriverServiceAreaResponseDataSchema,
  GeoLineStringSchema,
  type DriverServiceAreaSettings,
} from "@routeride/contracts";
import { buildServiceAreaSettings, type ServiceAreaDraft } from "./model";
import { AvailabilityScheduleEditor } from "./AvailabilityScheduleEditor";

const emptyDraft: ServiceAreaDraft = {
  savedArea: null,
  southwest: null,
  northeast: null,
  startingLocation: null,
  availability: [],
  acceptingRequests: true,
  routeState: "UNSET",
  routePolyline: null,
};
function unwrap(value: unknown): unknown {
  return typeof value === "object" && value !== null && "data" in value
    ? value.data
    : value;
}

export function ServiceAreaEditor({
  onChange,
}: {
  onChange: (settings: DriverServiceAreaSettings | null) => void;
}) {
  const [draft, setDraft] = useState<ServiceAreaDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [locations, setLocations] = useState<Record<string, string>>({});
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const client = getApiClient();
        const response = await client.get<unknown>("/drivers/me/service-area");
        const data = DriverServiceAreaResponseDataSchema.parse(
          unwrap(response.data),
        );
        const settings = data.settings;
        let routePolyline: DriverServiceAreaSettings["routePolyline"] = null;
        if (!settings) {
          const profileResponse = await client.get<unknown>("/drivers/me");
          const profile = unwrap(profileResponse.data);
          if (
            typeof profile === "object" &&
            profile !== null &&
            "routePolyline" in profile &&
            profile.routePolyline != null
          ) {
            routePolyline = GeoLineStringSchema.parse(profile.routePolyline);
          }
        }
        if (!mounted) return;
        setDraft(
          settings
            ? {
                ...settings,
                savedArea: settings.serviceArea,
                southwest: [
                  Math.min(...settings.serviceArea.coordinates[0]!.map((p) => p[0])),
                  Math.min(...settings.serviceArea.coordinates[0]!.map((p) => p[1])),
                ],
                northeast: [
                  Math.max(...settings.serviceArea.coordinates[0]!.map((p) => p[0])),
                  Math.max(...settings.serviceArea.coordinates[0]!.map((p) => p[1])),
                ],
              }
            : {
                ...emptyDraft,
                routePolyline,
                routeState: routePolyline ? "ESTABLISHED" : "UNSET",
              },
        );
      } catch {
        if (mounted) setLoadError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [revision]);
  useEffect(() => {
    if (loading || loadError) {
      onChange(null);
      return;
    }
    try {
      onChange(buildServiceAreaSettings(draft));
    } catch {
      onChange(null);
    }
  }, [draft, onChange, loading, loadError]);
  if (loading)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading service-area settings"
        color={colors.secondary}
      />
    );
  if (loadError)
    return (
      <View style={styles.group}>
        <Text accessibilityRole="alert" style={styles.hint}>
        Could not load your saved service-area settings. Retry before editing.
        </Text>
        <Button
          accessibilityLabel="Retry service-area settings"
          onPress={() => setRevision((value) => value + 1)}
          role="driver"
        >
          Retry service-area settings
        </Button>
      </View>
    );
  const change = (update: Partial<ServiceAreaDraft>) =>
    setDraft((current) => ({ ...current, ...update }));
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.heading}>
        Service area and availability
      </Text>
      <Text style={styles.hint}>
        Choose the corners of the area you serve, your starting location, and
        the hours you can drive.
      </Text>
      <PlaceSearchInput
        label="Southwest service-area corner"
        testID="service-area-southwest"
        hint="Choose the southwest corner of the area you serve."
        onLocationSelected={(location) =>
          change({ savedArea: null, southwest: [location.lng, location.lat] })
        }
      />
      <PlaceSearchInput
        label="Northeast service-area corner"
        testID="service-area-northeast"
        hint="Choose the northeast corner of the area you serve."
        onLocationSelected={(location) =>
          change({ savedArea: null, northeast: [location.lng, location.lat] })
        }
      />
      <PlaceSearchInput
        label="Starting location"
        testID="service-area-start"
        hint="Where you start before your first pickup. This is not your live location."
        onLocationSelected={(location) => {
          change({
            startingLocation: {
              type: "Point",
              coordinates: [location.lng, location.lat],
            },
          });
          setLocations((previous) => ({
            ...previous,
            start: location.address,
          }));
        }}
      />
      {draft.startingLocation && (
        <Text style={styles.hint}>
          {locations["start"] ??
            `Saved start: ${draft.startingLocation.coordinates[1].toFixed(4)}, ${draft.startingLocation.coordinates[0].toFixed(4)}`}
        </Text>
      )}
      <AvailabilityScheduleEditor
        availability={draft.availability}
        onChange={(availability) => change({ availability })}
      />
      <View style={styles.toggle}>
        <Text style={styles.hint}>Accept new requests</Text>
        <Switch
          accessibilityLabel="Accept new requests"
          value={draft.acceptingRequests}
          onValueChange={(acceptingRequests) => change({ acceptingRequests })}
        />
      </View>
      <Text style={styles.hint}>
        New requests need your approval. Saving your schedule does not confirm a
        rider or reserve a seat.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  heading: { ...typography.headlineMd, color: colors.onSurface },
  hint: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
  },
});

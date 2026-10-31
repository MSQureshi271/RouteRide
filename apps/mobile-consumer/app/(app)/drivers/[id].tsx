import React, { useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  DriverPublicProfileSchema,
  type DriverPublicProfile,
} from "@routeride/contracts";
import {
  colors,
  formatMonthlyPrice,
  getApiClient,
  radii,
  spacing,
  typography,
} from "@routeride/ui";
import { ScreenHeader } from "../../../src/components/common/ScreenHeader";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const VERIFICATION = {
  BASIC:
    "Basic verification: identity, driving licence and vehicle documents checked.",
  ENHANCED:
    "Enhanced verification includes additional driver checks. Ask support for the checks recorded for this driver.",
  ELITE:
    "Elite verification includes additional driver checks. Ask support for the checks recorded for this driver.",
};

export default function DriverProfileScreen() {
  const raw = useLocalSearchParams();
  const router = useRouter();
  const value = (key: string) => (typeof raw[key] === "string" ? raw[key] : "");
  const id = value("id");
  const riderId = value("riderId");
  const day = value("day");
  const departureTime = value("departureTime");
  const subscriptionType = value("subscriptionType");
  const pickupTime = value("pickupTime");
  const [profile, setProfile] = useState<DriverPublicProfile | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setProfile(null);
    setError(null);
    const params: Record<string, string> = {
      riderId,
      day,
      departureTime,
      subscriptionType,
      reviewsPage: String(page),
    };
    if (pickupTime) params["pickupTime"] = pickupTime;
    for (const key of ["pickupLat", "pickupLng", "destLat", "destLng"]) {
      const coordinate = raw[key];
      if (typeof coordinate === "string") params[key] = coordinate;
    }
    if (!id || !riderId || !day || !departureTime || !subscriptionType) {
      setError("Choose a passenger and commute from driver search first.");
      setLoading(false);
      return;
    }
    void getApiClient()
      .get(`/drivers/${id}/public-profile`, { params })
      .then((response) => {
        const result = DriverPublicProfileSchema.parse(
          (response.data as { data: unknown }).data,
        );
        if (active) setProfile(result);
      })
      .catch(() => {
        if (active)
          setError(
            "This driver could not be reviewed for your commute. Availability may have changed. Retry or return to search.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    id,
    riderId,
    day,
    departureTime,
    subscriptionType,
    pickupTime,
    page,
    retry,
    raw["pickupLat"],
    raw["pickupLng"],
    raw["destLat"],
    raw["destLng"],
  ]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Driver profile" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.heading}>Your commute</Text>
          <Text style={styles.body}>
            {value("riderName") || "Selected passenger"} ·{" "}
            {DAYS[Number(day)] ?? "Selected day"}
          </Text>
          <Text style={styles.body}>
            {departureTime}
            {pickupTime ? ` / ${pickupTime}` : ""} ·{" "}
            {subscriptionType.replaceAll("_", " ")}
          </Text>
          <Text style={styles.body}>
            {value("pickupAddress") || "Saved pickup"} →{" "}
            {value("destAddress") || "Saved destination"}
          </Text>
        </View>
        {loading && (
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Loading driver profile...
          </Text>
        )}
        {error && (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.body}>
              {error}
            </Text>
            <TouchableOpacity
              style={styles.button}
              accessibilityRole="button"
              onPress={() => setRetry((n) => n + 1)}
            >
              <Text style={styles.buttonText}>Retry profile</Text>
            </TouchableOpacity>
          </View>
        )}
        {profile && !loading && (
          <>
            <View style={styles.card}>
              {profile.photoUrl && (
                <Image
                  source={{ uri: profile.photoUrl }}
                  style={styles.photo}
                  accessibilityLabel={`${profile.driver.driverName}'s profile photo`}
                />
              )}
              <Text accessibilityRole="header" style={styles.heading}>
                {profile.driver.driverName}
              </Text>
              <Text style={styles.body}>
                {profile.driver.vehicleColour} {profile.driver.vehicleMake}{" "}
                {profile.driver.vehicleModel} · {profile.vehicleYear}
              </Text>
              <Text style={styles.body}>Plate {profile.plateNumber}</Text>
              <TouchableOpacity
                style={styles.link}
                accessibilityRole="button"
                accessibilityState={{ expanded: verificationOpen }}
                onPress={() => setVerificationOpen((open) => !open)}
              >
                <Text style={styles.body}>
                  {profile.verificationTier} verification · What was checked?
                </Text>
              </TouchableOpacity>
              {verificationOpen && (
                <Text style={styles.body}>
                  {VERIFICATION[profile.verificationTier]}
                </Text>
              )}
            </View>
            <View style={styles.card}>
              <Text style={styles.heading}>Available for this commute</Text>
              <Text style={styles.body}>
                {profile.driver.availableSeats} seats available ·{" "}
                {formatMonthlyPrice(
                  profile.driver.monthlyPriceCents,
                  profile.driver.currency,
                )}
              </Text>
              <Text style={styles.body}>
                {profile.driver.routeState === "UNSET"
                  ? "No established route"
                  : `Estimated pickup to route: ${Math.round(profile.driver.pickupDistanceMeters ?? 0)}m · destination to route: ${Math.round(profile.driver.destDistanceMeters ?? 0)}m`}
              </Text>
              {profile.driver.routeState === "ESTABLISHED" && (
                <Text style={styles.body}>
                  Geographic distance estimates, not travel time or walking
                  directions.
                </Text>
              )}
              <Text style={styles.body}>
                Driver approval required. Transportation is confirmed only after
                the driver accepts your request.
              </Text>
              <TouchableOpacity
                disabled
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                style={[styles.button, styles.disabled]}
              >
                <Text style={styles.buttonText}>Send request</Text>
              </TouchableOpacity>
              <Text style={styles.body}>
                Sending requests will be available in a future update. No
                request has been sent.
              </Text>
            </View>
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.heading}>
                Verified reviews
              </Text>
              <Text style={styles.body}>
                {profile.driver.avgRating === null
                  ? "New driver · No reviews yet"
                  : `${profile.driver.avgRating.toFixed(1)} / 5 · ${profile.driver.reviewCount} reviews`}
              </Text>
              {profile.ratingDistribution.map((bin) => (
                <Text key={bin.rating} style={styles.body}>
                  {bin.rating} stars: {bin.count}
                </Text>
              ))}
              {profile.reviews.map((review, index) => (
                <View
                  key={`${review.createdAt}-${index}`}
                  style={styles.review}
                >
                  <Text style={styles.body}>
                    {review.rating} / 5 · Verified customer ·{" "}
                    {new Date(review.createdAt).toLocaleDateString()}
                  </Text>
                  {review.comment && (
                    <Text style={styles.body}>{review.comment}</Text>
                  )}
                </View>
              ))}
              {page > 1 && (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.button}
                  onPress={() => setPage((n) => n - 1)}
                >
                  <Text style={styles.buttonText}>Previous reviews</Text>
                </TouchableOpacity>
              )}
              {profile.reviewsPagination.hasMore && (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.button}
                  onPress={() => setPage((n) => n + 1)}
                >
                  <Text style={styles.buttonText}>Next reviews</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: { ...typography.headlineMd, color: colors.onSurface },
  body: { ...typography.bodyMd, color: colors.onSurface },
  button: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
  },
  buttonText: { ...typography.bodyMd, color: colors.onPrimary },
  disabled: { opacity: 0.5 },
  link: { minHeight: 48, justifyContent: "center" },
  photo: { width: 80, height: 80, borderRadius: radii.md },
  review: {
    borderTopWidth: 1,
    borderColor: colors.outlineVariant,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
});

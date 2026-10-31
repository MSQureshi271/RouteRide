import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenHeader } from "../../../src/components/common/ScreenHeader";
import { formatTimeDisplay } from "../../../src/components/search/timeUtils";
import { formatSelectedDays } from "../../../src/components/search/formatDays";
import {
  DriverCard,
  Skeleton,
  colors,
  spacing,
  radii,
  typography,
  getApiClient,
} from "@routeride/ui";
import {
  DriverDiscoveryResponseDataV2Schema,
  type DriverDiscoveryResponseDataV2,
} from "@routeride/contracts";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function SearchResultsScreen() {
  const router = useRouter();
  const rawParams = useLocalSearchParams();
  const riderId =
    typeof rawParams["riderId"] === "string" ? rawParams["riderId"] : "";
  const day = typeof rawParams["day"] === "string" ? rawParams["day"] : "1";
  const departureTime =
    typeof rawParams["departureTime"] === "string"
      ? rawParams["departureTime"]
      : "07:30";
  const subscriptionType =
    (rawParams["subscriptionType"] as "ONE_WAY" | "ROUND_TRIP") ?? "ONE_WAY";
  const pickupTime =
    typeof rawParams["pickupTime"] === "string"
      ? rawParams["pickupTime"]
      : undefined;
  const pickupAddress =
    typeof rawParams["pickupAddress"] === "string"
      ? rawParams["pickupAddress"]
      : undefined;
  const destAddress =
    typeof rawParams["destAddress"] === "string"
      ? rawParams["destAddress"]
      : undefined;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DriverDiscoveryResponseDataV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [riderId, day, departureTime, subscriptionType, pickupTime]);

  useEffect(() => {
    let active = true;
    async function searchDrivers() {
      try {
        setLoading(true);
        setError(null);

        const queryParams: Record<string, string> = {
          riderId,
          day,
          departureTime,
          subscriptionType,
          page: String(page),
          pageSize: "20",
        };
        if (pickupTime) {
          queryParams["pickupTime"] = pickupTime;
        }

        const res = await getApiClient().get("/drivers/search", {
          params: queryParams,
        });

        const envelope = res.data as { data: unknown };
        const parsed = DriverDiscoveryResponseDataV2Schema.parse(envelope.data);
        if (active) setData(parsed);
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ??
          "Failed to fetch matching drivers. Please check your connection and try again.";
        if (active) setError(message);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (riderId) {
      void searchDrivers();
    } else {
      setError("Choose a passenger before searching for drivers.");
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [riderId, day, departureTime, subscriptionType, pickupTime, page, retry]);

  const dayIndex = Number(day);
  const dayName = DAY_NAMES[dayIndex] ?? "Weekday";
  const selectedDaysParam = rawParams["selectedDays"];
  const selectedDays =
    typeof selectedDaysParam === "string" &&
    /^[0-6](,[0-6])*$/.test(selectedDaysParam)
      ? selectedDaysParam.split(",").map(Number)
      : [dayIndex];
  const daySummary = formatSelectedDays(selectedDays) || dayName;
  const formatTime = (time: string) =>
    formatTimeDisplay(time).replace(/^0/, "");

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Available Drivers"
        onBack={() => router.back()}
        backTestID="results-back-button"
        testID="results-header"
      />

      <FlatList
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        data={!loading && !error ? (data?.results ?? []) : []}
        keyExtractor={(driver) => driver.driverProfileId}
        renderItem={({ item: driver }) => (
          <DriverCard
            driver={driver}
            scheduleLabel={`${dayName} at ${departureTime}${pickupTime ? ` and ${pickupTime}` : ""}`}
            onReview={() =>
              router.push({
                pathname: "/(app)/search/drivers/[id]",
                params: { ...rawParams, id: driver.driverProfileId },
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListHeaderComponent={
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryInner}>
                <View style={styles.summaryRow}>
                  <View
                    style={styles.iconColumn}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <View style={styles.calendarIcon}>
                      <View style={styles.calendarLine} />
                    </View>
                  </View>
                  <Text style={styles.summaryLabel}>Days</Text>
                  <View style={styles.timeValues}>
                    <Text style={styles.summaryValue}>{daySummary}</Text>
                  </View>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <View
                    style={styles.iconColumn}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <View style={styles.clockIcon}>
                      <View style={styles.clockHand} />
                    </View>
                  </View>
                  <Text style={styles.summaryLabel}>Time</Text>
                  <View style={styles.timeValues}>
                    <Text style={styles.summaryValue}>
                      {formatTime(departureTime)}
                      {subscriptionType === "ROUND_TRIP" && pickupTime
                        ? ` – ${formatTime(pickupTime)}`
                        : ""}
                    </Text>
                  </View>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.routePreview}>
                  <View
                    style={styles.timeline}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <View style={styles.originDot} />
                    <View style={styles.timelineLine} />
                    <View style={styles.destinationDot} />
                  </View>
                  <View style={styles.routeDetails}>
                    <View>
                      <Text
                        style={styles.routePoint}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        accessibilityLabel={`Pickup: ${pickupAddress || "Address unavailable"}`}
                      >
                        {pickupAddress || "Address unavailable"}
                      </Text>
                    </View>
                    <View>
                      <Text
                        style={styles.routePoint}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        accessibilityLabel={`Drop-off: ${destAddress || "Address unavailable"}`}
                      >
                        {destAddress || "Address unavailable"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Content States */}
            {loading && (
              <View style={styles.stateContainer}>
                <Skeleton height={120} />
                <Skeleton height={120} />
                <Skeleton height={120} />
                <Text
                  style={styles.loadingText}
                  accessibilityLiveRegion="polite"
                >
                  Finding available drivers for your commute...
                </Text>
              </View>
            )}

            {!loading && error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorEmoji}>??</Text>
                <Text style={styles.errorTitle}>Search Error</Text>
                <Text style={styles.errorMessage} accessibilityRole="alert">
                  {error}
                </Text>
                <TouchableOpacity
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Retry search"
                  onPress={() => setRetry((value) => value + 1)}
                >
                  <Text style={styles.actionBtnText}>Retry search</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Modify search"
                  onPress={() => router.back()}
                >
                  <Text style={styles.actionBtnText}>Modify Search</Text>
                </TouchableOpacity>
              </View>
            )}

            {!loading && !error && data && data.results.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text
                  style={styles.emptyEmoji}
                  accessible={false}
                  importantForAccessibility="no"
                >
                  {"\u{1F50D}"}
                </Text>
                <Text style={styles.emptyTitle}>No Drivers Available</Text>
                <Text style={styles.emptySubtitle}>
                  No verified drivers currently offer coverage and availability
                  for this commute. Try another schedule.
                </Text>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.back()}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnText}>
                    Adjust Schedule or Time
                  </Text>
                </TouchableOpacity>
                {page > 1 && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Previous drivers"
                    onPress={() => setPage((value) => value - 1)}
                  >
                    <Text style={styles.actionBtnText}>Previous drivers</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {!loading && !error && data && data.results.length > 0 && (
              <View>
                <Text style={styles.resultsHeading} accessibilityRole="header">
                  Drivers Found
                </Text>
                <Text style={styles.countText} accessibilityLiveRegion="polite">
                  {data.pagination.total} available driver
                  {data.pagination.total === 1 ? "" : "s"}. Best commute matches
                  appear first. Page {data.pagination.page}.
                </Text>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          !loading && !error && data && data.results.length > 0 ? (
            <View style={styles.pagination}>
              {page > 1 && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Previous drivers"
                  onPress={() => setPage((value) => value - 1)}
                >
                  <Text style={styles.actionBtnText}>Previous drivers</Text>
                </TouchableOpacity>
              )}
              {data.pagination.hasMore && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Next drivers"
                  onPress={() => setPage((value) => value + 1)}
                >
                  <Text style={styles.actionBtnText}>Next drivers</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  summaryCard: {
    borderRadius: radii.xl,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceDim,
  },
  summaryInner: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  iconColumn: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarIcon: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: colors.onSurface,
    borderRadius: 4,
  },
  calendarLine: {
    borderTopWidth: 2,
    borderColor: colors.onSurface,
    marginTop: 5,
  },
  clockIcon: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.onSurface,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  clockHand: {
    width: 7,
    height: 9,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.onSurface,
    marginLeft: 5,
    marginBottom: 4,
  },
  summaryLabel: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    width: 48,
  },
  summaryValue: {
    ...typography.bodyMd,
    fontWeight: "600",
    color: colors.onSurface,
    flexShrink: 1,
  },
  timeValues: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.surfaceDim,
  },
  routePreview: {
    flexDirection: "row",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  timeline: {
    width: 32,
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  originDot: {
    width: 12,
    height: 12,
    borderRadius: radii.full,
    backgroundColor: colors.routeBlue,
  },
  timelineLine: {
    flex: 1,
    minHeight: 24,
    width: 2,
    backgroundColor: colors.routeBlue,
  },
  destinationDot: {
    width: 12,
    height: 12,
    borderRadius: radii.full,
    backgroundColor: colors.onSurface,
  },
  routeDetails: {
    flex: 1,
    gap: spacing.md,
  },
  routePoint: {
    ...typography.bodyMd,
    color: colors.onSurface,
    fontWeight: "600",
  },
  stateContainer: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...typography.headlineMd,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.md,
  },

  errorContainer: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  errorEmoji: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  errorTitle: {
    ...typography.headlineMd,
    fontSize: 18,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  errorMessage: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  actionBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    alignItems: "center",
  },
  actionBtnText: {
    color: colors.onPrimary,
    fontWeight: "700",
    ...typography.bodyMd,
  },
  pagination: {
    gap: spacing.md,
  },
  countText: {
    ...typography.bodyMd,
    fontSize: 12,
    fontWeight: "600",
    color: colors.onSurfaceVariant,
    marginBottom: spacing.xs,
  },
  resultsHeading: {
    ...typography.headlineMd,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.xs,
  },
});

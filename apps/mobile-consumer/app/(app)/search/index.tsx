/**
 * Search Input Screen (Task 1.11 Redesign).
 *
 * Implements the redesigned commute search UX:
 *  - Rider dropdown with initial avatar, name, chevron and modal picker
 *  - Route preview card with origin ring, dotted timeline, destination icon, and edit link
 *  - Schedule card with Round Trip / One-Way segmented pill toggle
 *  - 7-day circular chips (S, M, T, W, T, F, S) with Work, Weekend, Custom preset bar
 *  - Interactive time picker modal replacing error-prone keyboard inputs
 *  - A departure time for One-Way, plus a return pickup time for Round Trip
 *  - Full compatibility with @routeride/contracts DriverSearchQuerySchema
 */

import React, { useState, useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { z } from "zod";
import { ScreenHeader } from "../../../src/components/common/ScreenHeader";

import {
  Button,
  EmptyState,
  colors,
  getApiClient,
  radii,
  spacing,
  typography,
} from "@routeride/ui";
import {
  DriverDiscoveryQueryV2Schema,
  type DriverDiscoveryQueryV2,
  type Rider,
} from "@routeride/contracts";

import { SearchInputSkeleton } from "../../../src/components/search/SearchInputSkeleton";
import { RiderDropdown } from "../../../src/components/search/RiderDropdown";
import { RoutePreviewCard } from "../../../src/components/search/RoutePreviewCard";
import {
  ScheduleCard,
  type TripType,
  type DayPreset,
} from "../../../src/components/search/ScheduleCard";
import { TimePickerModal } from "../../../src/components/search/TimePickerModal";

// ─── Tier 1: UI Form State Schema ─────────────────────────────────────────────

export const SearchInputFormStateSchema = z
  .object({
    riderId: z.string().uuid({ message: "Please select a rider" }),
    tripType: z.enum(["ONE_WAY", "ROUND_TRIP"]),
    selectedDays: z
      .array(z.number().int().min(0).max(6))
      .min(1, { message: "Please select at least one commute day" }),
    departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
      message: "Departure time must be in 24h format (HH:mm)",
    }),
    pickupTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
        message: "Pickup time must be in 24h format (HH:mm)",
      })
      .optional(),
  })
  .refine(
    (data) => {
      return data.tripType === "ROUND_TRIP"
        ? Boolean(
            data.departureTime &&
            data.pickupTime &&
            data.pickupTime > data.departureTime,
          )
        : data.pickupTime === undefined;
    },
    {
      message:
        "Enter a departure time, and a later pickup time for round trips",
      path: ["departureTime"],
    },
  );

export type SearchInputFormState = z.infer<typeof SearchInputFormStateSchema>;

// ─── Tier 2: Transform & Authoritative Contract Parse ─────────────────────────

export function buildDriverSearchQuery(
  form: SearchInputFormState,
): DriverDiscoveryQueryV2 {
  // Map commute days: default to first selected day for primary route lookup
  const primaryDay = form.selectedDays[0] ?? 1;

  if (form.tripType === "ONE_WAY") {
    const payload: Record<string, unknown> = {
      riderId: form.riderId,
      day: primaryDay,
      departureTime: form.departureTime,
      subscriptionType: "ONE_WAY",
    };
    return DriverDiscoveryQueryV2Schema.parse(payload);
  }

  // ROUND_TRIP
  const payload: Record<string, unknown> = {
    riderId: form.riderId,
    day: primaryDay,
    departureTime: form.departureTime,
    subscriptionType: "ROUND_TRIP",
    pickupTime: form.pickupTime,
  };
  return DriverDiscoveryQueryV2Schema.parse(payload);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchInputScreen() {
  const router = useRouter();

  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRiderId, setSelectedRiderId] = useState<string>("");

  // Schedule state
  const [tripType, setTripType] = useState<TripType>("ROUND_TRIP");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Work days
  const [activePreset, setActivePreset] = useState<DayPreset>("WORK");
  const [departureTime24, setDepartureTime24] = useState<string>("08:30");
  const [pickupTime24, setPickupTime24] = useState<string>("16:30");

  // Time Picker Modal state
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [pickerSession, setPickerSession] = useState(0);
  const [activePickerType, setActivePickerType] = useState<
    "departure" | "pickup"
  >("departure");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRiders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getApiClient().get("/consumers/me/riders");
      const list = ((res.data as unknown as { data?: Rider[] })?.data ??
        res.data) as Rider[];
      const validRiders = Array.isArray(list) ? list : [];
      setRiders(validRiders);

      if (validRiders.length > 0) {
        setSelectedRiderId((prev) => (prev ? prev : validRiders[0]!.id));
      }
    } catch {
      setRiders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchRiders();
    }, [fetchRiders]),
  );

  const selectedRider =
    riders.find((r) => r.id === selectedRiderId) ?? riders[0] ?? null;

  // Day preset handler
  const handleSelectPreset = (preset: DayPreset) => {
    setActivePreset(preset);
    if (preset === "WORK") {
      setSelectedDays([1, 2, 3, 4, 5]);
    } else if (preset === "WEEKEND") {
      setSelectedDays([0, 6]);
    }
  };

  // Toggle individual day
  const handleToggleDay = (dayIndex: number) => {
    setSelectedDays((prev) => {
      let next: number[];
      if (prev.includes(dayIndex)) {
        next = prev.filter((d) => d !== dayIndex);
      } else {
        next = [...prev, dayIndex].sort();
      }
      return next;
    });
    setActivePreset("CUSTOM");
  };

  // Open modal pickers
  const openDeparturePicker = () => {
    setActivePickerType("departure");
    setPickerSession((session) => session + 1);
    setPickerModalVisible(true);
  };

  const openPickupPicker = () => {
    setActivePickerType("pickup");
    setPickerSession((session) => session + 1);
    setPickerModalVisible(true);
  };

  const handleConfirmTime = (time24: string) => {
    if (activePickerType === "departure") {
      setDepartureTime24(time24);
    } else {
      setPickupTime24(time24);
    }
    setPickerModalVisible(false);
  };

  const handleSubmit = () => {
    setErrors({});

    const formState: SearchInputFormState = {
      riderId: selectedRider?.id ?? "",
      tripType,
      selectedDays,
      departureTime: departureTime24,
      ...(tripType === "ROUND_TRIP" ? { pickupTime: pickupTime24 } : {}),
    };

    // 1. Tier 1: UI Form State Validation
    const validationResult = SearchInputFormStateSchema.safeParse(formState);
    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validationResult.error.issues) {
        const field = issue.path[0] ? String(issue.path[0]) : "general";
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      // 2. Tier 2: Contract Parse
      const query = buildDriverSearchQuery(validationResult.data);

      // 3. Navigate to Results Screen
      router.push({
        pathname: "/(app)/search/results" as never,
        params: {
          riderId: query.riderId,
          day: String(query.day),
          selectedDays: validationResult.data.selectedDays.join(","),
          departureTime: query.departureTime,
          subscriptionType: query.subscriptionType,
          ...(query.pickupTime ? { pickupTime: query.pickupTime } : {}),
          ...(selectedRider ? { riderName: selectedRider.name } : {}),
          ...(selectedRider
            ? { pickupAddress: selectedRider.homeAddressText }
            : {}),
          ...(selectedRider
            ? { destAddress: selectedRider.destAddressText }
            : {}),
        },
      });
    } catch {
      setErrors({ general: "Invalid search parameters" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Find Drivers"
        onBack={() => router.back()}
        backTestID="search-back-button"
        testID="search-header"
      />

      {loading ? (
        <SearchInputSkeleton />
      ) : riders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon={<Text style={{ fontSize: 40 }}>🚗</Text>}
            title="No Passengers Registered"
            subtitle="Add your child or rider profile first with home pickup and destination addresses."
            action={{
              label: "Add a Rider",
              onPress: () => router.push("/(app)/riders/add"),
            }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* General Error Banner */}
          {errors["general"] && (
            <View style={styles.errorBanner} testID="search-error-general">
              <Text style={styles.errorBannerText}>{errors["general"]}</Text>
            </View>
          )}

          {/* 1. Rider Dropdown Selector */}
          <RiderDropdown
            riders={riders}
            selectedRiderId={selectedRider?.id ?? ""}
            onSelectRider={(r) => setSelectedRiderId(r.id)}
          />

          {/* 2. Route Preview Card (Corridor) */}
          <RoutePreviewCard rider={selectedRider} />

          {/* 3. Schedule Card */}
          <ScheduleCard
            tripType={tripType}
            onChangeTripType={setTripType}
            selectedDays={selectedDays}
            onToggleDay={handleToggleDay}
            onSelectPreset={handleSelectPreset}
            activePreset={activePreset}
            departureTime24={departureTime24}
            pickupTime24={pickupTime24}
            onOpenDeparturePicker={openDeparturePicker}
            onOpenPickupPicker={openPickupPicker}
          />

          {/* Validation Feedback */}
          {errors["selectedDays"] && (
            <Text style={styles.fieldError}>{errors["selectedDays"]}</Text>
          )}
          {errors["departureTime"] && (
            <Text style={styles.fieldError}>{errors["departureTime"]}</Text>
          )}
          {errors["pickupTime"] && (
            <Text style={styles.fieldError}>{errors["pickupTime"]}</Text>
          )}

          {/* 4. Find Drivers CTA */}
          <Button
            variant="primary"
            onPress={handleSubmit}
            loading={isSubmitting}
            accessibilityLabel="Find Drivers"
            testID="submit-search-button"
            style={styles.submitBtn}
          >
            Find Drivers
          </Button>
        </ScrollView>
      )}

      {/* Interactive Time Picker Modal */}
      <TimePickerModal
        key={pickerSession}
        visible={pickerModalVisible}
        title={
          activePickerType === "departure"
            ? "Select Departure Time"
            : "Select Pickup Time"
        }
        initialTime24={
          activePickerType === "departure" ? departureTime24 : pickupTime24
        }
        onConfirm={handleConfirmTime}
        onCancel={() => setPickerModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  backBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  backBtnText: {
    ...typography.bodyMd,
    color: colors.primary,
    fontWeight: "600",
  },
  headerTitle: {
    ...typography.headlineMd,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: colors.onSurface,
  },
  backBtnPlaceholder: {
    width: 48,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    ...typography.bodyMd,
    color: colors.onErrorContainer,
  },
  fieldError: {
    ...typography.bodyMd,
    color: colors.error,
    fontSize: 12,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    marginTop: spacing.md,
    borderRadius: radii.sm,
  },
});

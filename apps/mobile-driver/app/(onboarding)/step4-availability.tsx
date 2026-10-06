/**
 * Step 4 — Availability and Pricing.
 *
 * Driver selects their operating days (Mon–Sun, at least 1, no duplicates)
 * and sets their base price per route per month.
 *
 * On submit, calls PATCH /api/v1/drivers/me, then navigates to the pending screen.
 *
 * Price is displayed in PKR (divided by 100 to show rupees from cents).
 * Platform min/max are shown as hints.
 */
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  Input,
  getApiClient,
  colors,
  spacing,
  typography,
} from "@routeride/ui";
import { fetchAndNavigateToOnboardingStep } from "../../src/navigation/onboardingRouter";
import type { DriverProfile } from "@routeride/contracts";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const PRICE_MIN_RS = 5000; // 500000 cents / 100
const PRICE_MAX_RS = 30000; // 3000000 cents / 100

// ─── Component ────────────────────────────────────────────────────────────────

export default function Step4AvailabilityScreen() {
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [priceRs, setPriceRs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    let mounted = true;
    async function loadExistingAvailability() {
      try {
        const res = await getApiClient().get<DriverProfile>("/drivers/me");
        const profile =
          (res.data as unknown as { data?: DriverProfile })?.data ?? res.data;
        if (mounted && profile) {
          if (
            Array.isArray(profile.operatingDays) &&
            profile.operatingDays.length > 0
          ) {
            setSelectedDays(profile.operatingDays);
          }
          if (profile.basePriceCents && profile.basePriceCents > 0) {
            setPriceRs(String(Math.round(profile.basePriceCents / 100)));
          }
        }
      } catch {
        // Silently preserve default state on error
      }
    }
    void loadExistingAvailability();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const handleSubmit = async () => {
    setError(null);

    if (selectedDays.length === 0) {
      setError("Select at least one operating day.");
      return;
    }

    const priceNum = parseInt(priceRs.replace(/,/g, ""), 10);
    if (isNaN(priceNum) || priceNum < PRICE_MIN_RS || priceNum > PRICE_MAX_RS) {
      setError(
        `Price must be between PKR ${PRICE_MIN_RS.toLocaleString()} and PKR ${PRICE_MAX_RS.toLocaleString()} per month.`,
      );
      return;
    }

    setLoading(true);
    try {
      await getApiClient().patch("/drivers/me", {
        operatingDays: selectedDays,
        basePriceCents: priceNum * 100,
      });
      await fetchAndNavigateToOnboardingStep();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      if (status === 422) {
        setError(msg ?? "Price is outside the allowed range.");
      } else if (status === 409) {
        setError(
          "Some of these days have active subscriptions — you cannot remove them.",
        );
      } else {
        setError("Failed to save availability. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {error && (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              accessible
            >
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Operating Days</Text>
          <Text style={styles.hint}>
            Select the days you are available to drive
          </Text>
          <View style={styles.daysRow}>
            {DAYS.map((day) => {
              const selected = selectedDays.includes(day.value);
              return (
                <TouchableOpacity
                  key={day.value}
                  style={[styles.dayChip, selected && styles.dayChipSelected]}
                  onPress={() => toggleDay(day.value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={day.label}
                  testID={`day-chip-${day.value}`}
                >
                  <Text
                    style={[
                      styles.dayChipText,
                      selected && styles.dayChipTextSelected,
                    ]}
                  >
                    {day.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Monthly Route Price (PKR)</Text>
          <Input
            label="Base price per route per month"
            inputId="onb-price"
            placeholder="10,000"
            keyboardType="numeric"
            hint={`Min PKR ${PRICE_MIN_RS.toLocaleString()} — Max PKR ${PRICE_MAX_RS.toLocaleString()}`}
            value={priceRs}
            onChangeText={setPriceRs}
          />

          <View style={styles.actions}>
            <Button
              variant="primary"
              role="driver"
              loading={loading}
              onPress={handleSubmit}
              accessibilityLabel="Submit application"
            >
              Submit Application
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.base, gap: spacing.base },
  sectionLabel: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    marginTop: spacing.sm,
  },
  hint: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    marginTop: -spacing.sm,
  },
  daysRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  dayChip: {
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    borderRadius: 20,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
  },
  dayChipSelected: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondaryContainer,
  },
  dayChipText: { ...typography.bodyMd, color: colors.onSurface },
  dayChipTextSelected: {
    color: colors.onSecondaryContainer,
    fontFamily: "Inter-Medium",
  },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorText: { ...typography.bodyMd, color: colors.onErrorContainer },
  actions: { paddingTop: spacing.lg },
});

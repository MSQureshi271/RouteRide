/**
 * Step 4 — Availability and Pricing.
 *
 * Driver declares their operating city, starting location and driving hours
 * of an optional route, then sets operating days and monthly pricing.
 *
 * Persists service-area settings before pricing and rechecks onboarding status.
 *
 * Price is displayed in PKR (divided by 100 to show rupees from cents).
 * Platform min/max are shown as hints.
 */
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
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
import type {
  DriverProfile,
  DriverServiceAreaSettings,
} from "@routeride/contracts";
import { ServiceAreaEditor } from "../../src/service-area/ServiceAreaEditor";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRICE_MIN_RS = 5000; // 500000 cents / 100
const PRICE_MAX_RS = 30000; // 3000000 cents / 100

// ─── Component ────────────────────────────────────────────────────────────────

export default function Step4AvailabilityScreen() {
  const [priceRs, setPriceRs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serviceAreaSettings, setServiceAreaSettings] =
    useState<DriverServiceAreaSettings | null>(null);

  React.useEffect(() => {
    let mounted = true;
    async function loadExistingAvailability() {
      try {
        const res = await getApiClient().get<DriverProfile>("/drivers/me");
        const profile =
          (res.data as unknown as { data?: DriverProfile })?.data ?? res.data;
        if (mounted && profile) {
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

  const handleSubmit = async () => {
    setError(null);

    const priceNum = parseInt(priceRs.replace(/,/g, ""), 10);
    if (isNaN(priceNum) || priceNum < PRICE_MIN_RS || priceNum > PRICE_MAX_RS) {
      setError(
        `Price must be between PKR ${PRICE_MIN_RS.toLocaleString()} and PKR ${PRICE_MAX_RS.toLocaleString()} per month.`,
      );
      return;
    }

    if (!serviceAreaSettings) {
      setError(
        "Choose an operating city, starting location, and at least one confirmed driving-hours range before submitting.",
      );
      return;
    }
    const offeredDays = [
      ...new Set(serviceAreaSettings.availability.map((window) => window.day)),
    ];
    setLoading(true);
    try {
      await getApiClient().put("/drivers/me/service-area", serviceAreaSettings);
      await getApiClient().patch("/drivers/me", {
        operatingDays: offeredDays,
        basePriceCents: priceNum * 100,
      });
      await fetchAndNavigateToOnboardingStep();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      if (status === 422) {
        setError(
          msg ??
            "Service area, availability, or price is outside the allowed values.",
        );
      } else if (status === 409) {
        setError(
          "Existing rider commitments prevent these location or availability changes.",
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

          <View style={styles.actions}>
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
            <ServiceAreaEditor onChange={setServiceAreaSettings} />
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
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorText: { ...typography.bodyMd, color: colors.onErrorContainer },
  actions: { paddingTop: spacing.lg },
});

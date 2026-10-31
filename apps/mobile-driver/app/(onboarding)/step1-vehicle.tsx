/**
 * Step 1 — Personal and Vehicle Details.
 *
 * Calls POST /api/v1/drivers/onboard on submit.
 * On success, navigates to step2-documents.
 * Progress key: stored in-memory via useRef (not persisted across app kill;
 * form data is too large for SecureStore. Step completion is tracked by API state).
 */
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Button,
  Input,
  getApiClient,
  useAuthStore,
  colors,
  spacing,
  typography,
} from "@routeride/ui";
import { OnboardDriverRequestSchema } from "@routeride/contracts";
import { useZodForm } from "@routeride/ui";
import { z } from "zod";

import {
  fetchAndNavigateToOnboardingStep,
  getOnboardingRoute,
} from "../../src/navigation/onboardingRouter";
import type { DriverOnboardingStatus } from "@routeride/contracts";

// ─── Step-1 only schema (exclude routePolyline — entered on step 3) ───────────

const Step1Schema = OnboardDriverRequestSchema.omit({
  routePolyline: true,
  operatingDays: true,
  basePriceCents: true,
  currency: true,
}).extend({
  vehicleYear: z
    .string()
    .regex(/^\d{4}$/, "Enter a 4-digit year")
    .transform(Number)
    .refine(
      (y) => y >= 1990 && y <= new Date().getFullYear() + 1,
      "Invalid vehicle year",
    ),
  seatCapacity: z
    .string()
    .regex(/^\d+$/, "Enter a number")
    .transform(Number)
    .refine((n) => n >= 1 && n <= 50, "Must be between 1 and 50"),
});

type Step1Form = z.infer<typeof Step1Schema>;

export default function Step1VehicleScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const { user, setUser } = useAuthStore();
  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useZodForm({ schema: Step1Schema });

  React.useEffect(() => {
    let mounted = true;
    async function checkOnboarding() {
      try {
        const client = getApiClient();
        const res = await client.get<DriverOnboardingStatus>(
          "/drivers/me/onboarding-status",
        );
        const data =
          (res.data as unknown as { data?: DriverOnboardingStatus })?.data ??
          res.data;
        if (
          mounted &&
          data.currentStep &&
          data.currentStep !== "step1-vehicle"
        ) {
          router.replace(getOnboardingRoute(data.currentStep) as never);
        }
      } catch {
        // No existing profile — stay on step 1
      }
    }
    void checkOnboarding();
    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (data: Step1Form) => {
    setServerError(null);
    try {
      const res = await getApiClient().post<{ id: string }>(
        "/drivers/onboard",
        {
          ...data,
          currency: "PKR",
        },
      );
      if (res.data?.id && user) {
        setUser({ ...user, driverProfileId: res.data.id });
      }
      await fetchAndNavigateToOnboardingStep();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        await fetchAndNavigateToOnboardingStep();
        return;
      }
      setServerError("Failed to save vehicle details. Please try again.");
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
          {serverError && (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              accessible
            >
              <Text style={styles.errorText}>{serverError}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Driver Licence</Text>
          <Input
            label="Licence number"
            inputId="onb-licence"
            placeholder="LIC-123456"
            autoCapitalize="characters"
            error={errors.licenceNumber?.message}
            value={watch("licenceNumber") ?? ""}
            onChangeText={(t) =>
              setValue("licenceNumber", t, { shouldValidate: true })
            }
          />

          <Text style={styles.sectionLabel}>Vehicle Information</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Input
                label="Make"
                inputId="onb-make"
                placeholder="Toyota"
                error={errors.vehicleMake?.message}
                value={watch("vehicleMake") ?? ""}
                onChangeText={(t) =>
                  setValue("vehicleMake", t, { shouldValidate: true })
                }
              />
            </View>
            <View style={styles.flex}>
              <Input
                label="Model"
                inputId="onb-model"
                placeholder="Corolla"
                error={errors.vehicleModel?.message}
                value={watch("vehicleModel") ?? ""}
                onChangeText={(t) =>
                  setValue("vehicleModel", t, { shouldValidate: true })
                }
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.flex}>
              <Input
                label="Year"
                inputId="onb-year"
                placeholder="2020"
                keyboardType="numeric"
                maxLength={4}
                error={errors.vehicleYear?.message}
                value={(watch("vehicleYear") as unknown as string) ?? ""}
                onChangeText={(t) =>
                  setValue("vehicleYear" as never, t as never, {
                    shouldValidate: true,
                  })
                }
              />
            </View>
            <View style={styles.flex}>
              <Input
                label="Colour"
                inputId="onb-colour"
                placeholder="White"
                error={errors.vehicleColour?.message}
                value={watch("vehicleColour") ?? ""}
                onChangeText={(t) =>
                  setValue("vehicleColour", t, { shouldValidate: true })
                }
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.flex}>
              <Input
                label="Plate number"
                inputId="onb-plate"
                placeholder="KHI-123"
                autoCapitalize="characters"
                error={errors.plateNumber?.message}
                value={watch("plateNumber") ?? ""}
                onChangeText={(t) =>
                  setValue("plateNumber", t, { shouldValidate: true })
                }
              />
            </View>
            <View style={styles.flex}>
              <Input
                label="Seats"
                inputId="onb-seats"
                placeholder="4"
                keyboardType="numeric"
                maxLength={2}
                hint="1–50"
                error={errors.seatCapacity?.message}
                value={(watch("seatCapacity") as unknown as string) ?? ""}
                onChangeText={(t) =>
                  setValue("seatCapacity" as never, t as never, {
                    shouldValidate: true,
                  })
                }
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              variant="primary"
              role="driver"
              loading={isSubmitting}
              onPress={() => handleSubmit(onSubmit)()}
              accessibilityLabel="Save vehicle details and continue"
            >
              Continue
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
  row: { flexDirection: "row", gap: spacing.md },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorText: { ...typography.bodyMd, color: colors.onErrorContainer },
  actions: { paddingTop: spacing.lg },
});

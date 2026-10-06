/**
 * Add Rider Screen — creates a new rider with server-side geocoding.
 *
 * Sends name and address text only (no GeoJSON from the client).
 * Server geocodes both addresses via the Maps adapter.
 *
 * Error handling:
 *  - 422 NO_ROUTE_FOUND → "We couldn't find that address..."
 *  - 503 → "Address service is temporarily unavailable..."
 *  - Other → generic retry message
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
  AddressPicker,
  getApiClient,
  colors,
  spacing,
  typography,
  useZodForm,
} from "@routeride/ui";
import { CreateRiderRequestSchema } from "@routeride/contracts";

type AddRiderForm = {
  name: string;
  homeAddressText: string;
  destAddressText: string;
  notes?: string;
};

export default function AddRiderScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useZodForm({ schema: CreateRiderRequestSchema });

  const onSubmit = async (data: AddRiderForm) => {
    setServerError(null);
    try {
      await getApiClient().post("/consumers/me/riders", data);
      router.back();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      const errCode = (
        err as { response?: { data?: { error?: { code?: string } } } }
      )?.response?.data?.error?.code;

      if (status === 422 || errCode === "NO_ROUTE_FOUND") {
        setServerError(
          "We couldn't find that address. Please enter a more specific address including the street and area.",
        );
      } else if (status === 503) {
        setServerError(
          "Address verification service is temporarily unavailable. Please try again shortly.",
        );
      } else {
        setServerError("Failed to add rider. Please try again.");
      }
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

          <Input
            label="Rider's full name"
            inputId="rider-name"
            placeholder="Sara Ahmed"
            autoComplete="name"
            error={errors.name?.message}
            value={watch("name") ?? ""}
            onChangeText={(t) => setValue("name", t, { shouldValidate: true })}
          />

          <AddressPicker
            label="Home address"
            inputId="rider-home"
            placeholder="House 12, Block A, DHA Phase 5, Karachi"
            error={errors.homeAddressText?.message}
            value={watch("homeAddressText") ?? ""}
            onChangeText={(t) =>
              setValue("homeAddressText", t, { shouldValidate: true })
            }
          />

          <AddressPicker
            label="School / destination address"
            inputId="rider-dest"
            placeholder="Karachi Grammar School, Bath Island, Clifton"
            error={errors.destAddressText?.message}
            value={watch("destAddressText") ?? ""}
            onChangeText={(t) =>
              setValue("destAddressText", t, { shouldValidate: true })
            }
          />

          <Input
            label="Notes (optional)"
            inputId="rider-notes"
            placeholder="e.g. Wears a blue backpack"
            multiline
            numberOfLines={3}
            error={errors.notes?.message}
            value={watch("notes") ?? ""}
            onChangeText={(t) => setValue("notes", t, { shouldValidate: true })}
          />

          <View style={styles.actions}>
            <Button
              variant="primary"
              role="consumer"
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit as never)}
              accessibilityLabel="Add rider"
            >
              Add Rider
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
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorText: { ...typography.bodyMd, color: colors.onErrorContainer },
  actions: { paddingTop: spacing.lg },
});

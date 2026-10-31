/**
 * Edit Rider Screen — updates an existing rider.
 *
 * Loads the current rider data on mount, pre-populates the form,
 * and calls PATCH /consumers/me/riders/:riderId on submit.
 */
import React, { useState, useEffect } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
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
import { UpdateRiderRequestSchema } from "@routeride/contracts";
import type { Rider } from "@routeride/contracts";

type EditRiderForm = {
  name?: string;
  homeAddressText?: string;
  destAddressText?: string;
  notes?: string;
};

export default function EditRiderScreen() {
  const { riderId } = useLocalSearchParams<{ riderId: string }>();
  const [rider, setRider] = useState<Rider | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useZodForm({ schema: UpdateRiderRequestSchema });

  useEffect(() => {
    async function load() {
      try {
        const res = await getApiClient().get("/consumers/me/riders");
        const list =
          (((res.data as unknown as { data?: Rider[] })?.data ??
            res.data) as Rider[]) || [];
        const found = Array.isArray(list)
          ? list.find((r) => r.id === riderId)
          : undefined;
        if (!found) {
          setFetchError("Rider not found.");
          return;
        }
        setRider(found);
        setValue("name", found.name);
        setValue("homeAddressText", found.homeAddressText);
        setValue("destAddressText", found.destAddressText);
        setValue("notes", found.notes ?? undefined);
      } catch {
        setFetchError("Failed to load rider details.");
      }
    }
    if (riderId) load();
  }, [riderId, setValue]);

  const onSubmit = async (data: EditRiderForm) => {
    setServerError(null);
    try {
      await getApiClient().patch(`/consumers/me/riders/${riderId}`, data);
      router.back();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      const errCode = (
        err as { response?: { data?: { error?: { code?: string } } } }
      )?.response?.data?.error?.code;

      if (status === 422 || errCode === "NO_ROUTE_FOUND") {
        setServerError(
          "We couldn't find that address. Please be more specific.",
        );
      } else if (status === 503) {
        setServerError(
          "Address service is temporarily unavailable. Please try again.",
        );
      } else {
        setServerError("Failed to update rider. Please try again.");
      }
    }
  };

  if (fetchError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{fetchError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!rider) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

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
              <Text style={styles.errorBannerText}>{serverError}</Text>
            </View>
          )}

          <Input
            label="Rider's full name"
            inputId="edit-rider-name"
            error={errors.name?.message}
            value={watch("name") ?? ""}
            onChangeText={(t) => setValue("name", t, { shouldValidate: true })}
          />

          <AddressPicker
            label="Home address"
            inputId="edit-rider-home"
            error={errors.homeAddressText?.message}
            value={watch("homeAddressText") ?? ""}
            onChangeText={(t) =>
              setValue("homeAddressText", t, { shouldValidate: true })
            }
          />

          <AddressPicker
            label="School / destination address"
            inputId="edit-rider-dest"
            error={errors.destAddressText?.message}
            value={watch("destAddressText") ?? ""}
            onChangeText={(t) =>
              setValue("destAddressText", t, { shouldValidate: true })
            }
          />

          <Input
            label="Notes (optional)"
            inputId="edit-rider-notes"
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
              onPress={() => handleSubmit(onSubmit as never)()}
              accessibilityLabel="Save changes"
            >
              Save Changes
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
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { flexGrow: 1, padding: spacing.base, gap: spacing.base },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorBannerText: { ...typography.bodyMd, color: colors.onErrorContainer },
  errorText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  actions: { paddingTop: spacing.lg },
});

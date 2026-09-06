/**
 * Driver register screen
 *
 * Same as consumer register but:
 *  - Role is hardcoded to DRIVER
 *  - Uses Safety Emerald (role="driver") on buttons
 *  - Copy says "Apply to drive"
 */
import { router } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import {
  Button,
  Input,
  useZodForm,
  getApiClient,
  colors,
  spacing,
  typography,
} from "@routeride/ui";
import { RegisterRequestSchema } from "@routeride/contracts";

// Extend with confirm-password (client-only field); role is omitted from UI validation and appended on submit
const DriverRegisterFormSchema = RegisterRequestSchema.omit({ role: true })
  .extend({
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type DriverRegisterForm = z.infer<typeof DriverRegisterFormSchema>;

export default function DriverRegisterScreen() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useZodForm({ schema: DriverRegisterFormSchema });

  const onSubmit = async (data: DriverRegisterForm) => {
    setServerError(null);
    try {
      const { confirmPassword: _unused, ...payload } = data;
      await getApiClient().post("/auth/register", {
        ...payload,
        role: "DRIVER",
      });
      router.push({ pathname: "/(auth)/otp", params: { phone: data.phone } });
    } catch (err: unknown) {
      console.error("[Driver Registration Error]:", err);
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      setServerError(
        status === 409
          ? "An account with this number already exists."
          : "Registration failed. Please try again.",
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Apply to drive</Text>
            <Text style={styles.subtitle}>Start earning with RouteRide</Text>
          </View>

          {serverError && (
            <View
              style={styles.errorBanner}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              accessible
            >
              <Text style={styles.errorBannerText}>{serverError}</Text>
            </View>
          )}

          <View style={styles.form}>
            <Input
              label="Full name"
              inputId="dreg-name"
              placeholder="Ali Hassan"
              autoComplete="name"
              textContentType="name"
              error={errors.fullName?.message}
              value={watch("fullName")}
              onChangeText={(t: string) =>
                setValue("fullName", t, { shouldValidate: true })
              }
            />
            <Input
              label="Phone number"
              inputId="dreg-phone"
              variant="phone"
              placeholder="+92 300 0000000"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              error={errors.phone?.message}
              value={watch("phone")}
              onChangeText={(t: string) =>
                setValue("phone", t, { shouldValidate: true })
              }
            />
            <Input
              label="Password"
              inputId="dreg-password"
              variant="password"
              autoComplete="new-password"
              textContentType="newPassword"
              hint="Minimum 8 characters"
              error={errors.password?.message}
              value={watch("password")}
              onChangeText={(t: string) =>
                setValue("password", t, { shouldValidate: true })
              }
            />
            <Input
              label="Confirm password"
              inputId="dreg-confirm"
              variant="password"
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.confirmPassword?.message}
              value={watch("confirmPassword")}
              onChangeText={(t: string) =>
                setValue("confirmPassword", t, { shouldValidate: true })
              }
            />
          </View>

          <View style={styles.actions}>
            <Button
              variant="primary"
              role="driver"
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
              accessibilityLabel="Apply to drive"
            >
              Apply to drive
            </Button>
            <View style={styles.loginRow}>
              <Text style={styles.mutedText}>Already a driver? </Text>
              <Pressable
                onPress={() => router.push("/(auth)/login")}
                accessibilityRole="link"
              >
                <Text style={styles.linkText}>Sign in</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: spacing.base,
    justifyContent: "center",
    gap: spacing.xl,
  },
  header: { gap: spacing.xs },
  title: { ...typography.headlineLgMobile, color: colors.onBackground },
  subtitle: { ...typography.bodyLg, color: colors.secondary },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorBannerText: { ...typography.bodyMd, color: colors.onErrorContainer },
  form: { gap: spacing.base },
  actions: { gap: spacing.base },
  loginRow: { flexDirection: "row", justifyContent: "center" },
  mutedText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  linkText: {
    ...typography.bodyMd,
    color: colors.secondary,
    fontFamily: "Inter-Medium",
  },
});

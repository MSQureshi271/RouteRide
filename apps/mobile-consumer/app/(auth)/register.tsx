/**
 * Consumer register screen
 *
 * Fields: full name, phone (E.164), password, confirm password
 * Role is hardcoded to CONSUMER — cannot be changed by the user.
 *
 * On success: navigates to the OTP screen with the phone number.
 *
 * Accessibility:
 *  - All errors associated with their field
 *  - Loading state disables the form and announces via accessibilityState
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
const RegisterFormSchema = RegisterRequestSchema.omit({ role: true })
  .extend({
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof RegisterFormSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useZodForm({ schema: RegisterFormSchema });

  const onSubmit = async (data: RegisterForm) => {
    setServerError(null);
    try {
      const { confirmPassword: _unused, ...payload } = data;
      await getApiClient().post("/auth/register", {
        ...payload,
        role: "CONSUMER", // enforced server-side, defensive here
      });
      // Navigate to OTP screen, passing the phone
      router.push({ pathname: "/(auth)/otp", params: { phone: data.phone } });
    } catch (err: unknown) {
      console.error("[Registration Error]:", err);
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Join RouteRide as a passenger</Text>
          </View>

          {/* Server error */}
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

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Full name"
              inputId="reg-name"
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
              inputId="reg-phone"
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
              inputId="reg-password"
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
              inputId="reg-confirm"
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

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              variant="primary"
              role="consumer"
              loading={isSubmitting}
              onPress={() => handleSubmit(onSubmit)()}
              accessibilityLabel="Create account"
            >
              Create account
            </Button>

            <View style={styles.loginRow}>
              <Text style={styles.mutedText}>Already have an account? </Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  subtitle: { ...typography.bodyLg, color: colors.onSurfaceVariant },
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
    color: colors.routeBlue,
    fontFamily: "Inter-Medium",
  },
});

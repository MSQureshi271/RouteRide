/**
 * Reset password screen
 *
 * Two fields: the OTP code + new password + confirm.
 * On success: all existing sessions are invalidated server-side.
 * Navigates to login on completion.
 */
import { router, useLocalSearchParams } from "expo-router";
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
import { z } from "zod";
import {
  Button,
  Input,
  OtpInput,
  useZodForm,
  getApiClient,
  colors,
  spacing,
  typography,
} from "@routeride/ui";

const Schema = z
  .object({
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResetPasswordScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useZodForm({ schema: Schema });

  const onSubmit = async (data: z.infer<typeof Schema>) => {
    if (code.length !== 6) {
      setServerError("Please enter the full 6-digit code.");
      return;
    }
    setServerError(null);
    try {
      await getApiClient().post("/auth/reset-password", {
        phone,
        code,
        newPassword: data.password,
      });
      setDone(true);
    } catch {
      setServerError(
        "Reset failed. The code may have expired. Please request a new one.",
      );
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.doneContainer}>
          <Text style={styles.doneIcon}>✅</Text>
          <Text style={styles.title}>Password updated</Text>
          <Text style={styles.subtitle}>
            All previous sessions have been signed out.
          </Text>
          <Button
            variant="primary"
            role="consumer"
            onPress={() => router.replace("/(auth)/login")}
            accessibilityLabel="Sign in with new password"
            style={styles.btn}
          >
            Sign in
          </Button>
        </View>
      </SafeAreaView>
    );
  }

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
            <Text style={styles.title}>Set new password</Text>
            <Text style={styles.subtitle}>Enter the code sent to {phone}</Text>
          </View>

          <OtpInput value={code} onChange={setCode} />

          <View style={styles.form}>
            <Input
              label="New password"
              inputId="reset-password"
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
              label="Confirm new password"
              inputId="reset-confirm"
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

          {serverError && (
            <View
              style={styles.errorBanner}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              accessible
            >
              <Text style={styles.errorText}>{serverError}</Text>
            </View>
          )}

          <Button
            variant="primary"
            role="consumer"
            loading={isSubmitting}
            onPress={() => handleSubmit(onSubmit)()}
            accessibilityLabel="Reset password"
          >
            Reset password
          </Button>
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
    gap: spacing.lg,
  },
  doneContainer: {
    flex: 1,
    padding: spacing.base,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.base,
  },
  doneIcon: { fontSize: 48, marginBottom: spacing.sm },
  header: { gap: spacing.sm },
  title: { ...typography.headlineLgMobile, color: colors.onBackground },
  subtitle: { ...typography.bodyLg, color: colors.onSurfaceVariant },
  form: { gap: spacing.base },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorText: { ...typography.bodyMd, color: colors.onErrorContainer },
  btn: { alignSelf: "stretch" },
});

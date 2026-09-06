/**
 * Consumer login screen
 *
 * Fields: phone (E.164), password
 * Actions: Login, Google sign-in, navigate to Register / Forgot Password
 *
 * Security:
 *  - Error message for invalid credentials is generic ("Login failed") — no account enumeration
 *  - Access token goes into the Zustand store in-memory only
 *  - No reference to AsyncStorage
 *
 * Accessibility:
 *  - All field errors associated with their input via nativeID
 *  - Server error announced via accessibilityLiveRegion
 *  - Focus order: phone → password → login button
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
import {
  Button,
  Input,
  useZodForm,
  getApiClient,
  useAuthStore,
  colors,
  spacing,
  typography,
} from "@routeride/ui";
import { LoginRequestSchema, type LoginRequest } from "@routeride/contracts";

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const { setTokens, setUser } = useAuthStore();

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useZodForm({
    schema: LoginRequestSchema,
    defaultValues: { phone: "", password: "" },
  });

  const onSubmit = async (data: LoginRequest) => {
    setServerError(null);
    try {
      const response = await getApiClient().post("/auth/login", data);
      const { tokens, user } = response.data.data;
      await setTokens(tokens, user);
      setUser(user);
      router.replace("/(app)");
    } catch {
      // Generic error — never reveal whether the phone exists
      setServerError("Login failed. Please check your number and password.");
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
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to RouteRide</Text>
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
              label="Phone number"
              inputId="login-phone"
              variant="phone"
              placeholder="+92 300 0000000"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              error={errors.phone?.message}
              value={watch("phone")}
              onChangeText={(t) =>
                setValue("phone", t, { shouldValidate: true })
              }
            />

            <Input
              label="Password"
              inputId="login-password"
              variant="password"
              autoComplete="password"
              textContentType="password"
              error={errors.password?.message}
              value={watch("password")}
              onChangeText={(t) =>
                setValue("password", t, { shouldValidate: true })
              }
            />

            <Pressable
              onPress={() => router.push("/(auth)/forgot-password")}
              accessibilityRole="link"
              style={styles.forgotLink}
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </Pressable>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              variant="primary"
              role="consumer"
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
              accessibilityLabel="Sign in"
            >
              Sign in
            </Button>

            <View style={styles.divider} accessibilityElementsHidden>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              variant="secondary"
              role="consumer"
              onPress={() => {
                /* Google OAuth — handled in T0.28 */
              }}
              accessibilityLabel="Continue with Google"
            >
              🔵 Continue with Google
            </Button>

            <View style={styles.registerRow}>
              <Text style={styles.registerText}>Don't have an account? </Text>
              <Pressable
                onPress={() => router.push("/(auth)/register")}
                accessibilityRole="link"
              >
                <Text style={[styles.registerText, styles.linkText]}>
                  Sign up
                </Text>
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
  forgotLink: { alignSelf: "flex-end", marginTop: -spacing.sm },
  linkText: {
    ...typography.bodyMd,
    color: colors.routeBlue,
    fontFamily: "Inter-Medium",
  },
  actions: { gap: spacing.base },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.outlineVariant },
  dividerText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  registerRow: { flexDirection: "row", justifyContent: "center" },
  registerText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
});

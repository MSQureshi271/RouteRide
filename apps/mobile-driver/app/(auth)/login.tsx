/**
 * Driver login screen
 *
 * Identical flow to consumer login but:
 *  - Uses role="driver" on Button (Safety Emerald primary color)
 *  - Branding copy is driver-specific
 *  - Same generic error message — no enumeration
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

export default function DriverLoginScreen() {
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
          <View style={styles.header}>
            <Text style={styles.title}>Driver sign in</Text>
            <Text style={styles.subtitle}>RouteRide Driver Portal</Text>
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
              label="Phone number"
              inputId="driver-login-phone"
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
              inputId="driver-login-password"
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

          <View style={styles.actions}>
            <Button
              variant="primary"
              role="driver"
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
              accessibilityLabel="Sign in as driver"
            >
              Sign in
            </Button>

            <View style={styles.registerRow}>
              <Text style={styles.mutedText}>New driver? </Text>
              <Pressable
                onPress={() => router.push("/(auth)/register")}
                accessibilityRole="link"
              >
                <Text style={styles.linkText}>Apply to drive</Text>
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
  forgotLink: { alignSelf: "flex-end", marginTop: -spacing.sm },
  linkText: {
    ...typography.bodyMd,
    color: colors.secondary,
    fontFamily: "Inter-Medium",
  },
  actions: { gap: spacing.base },
  registerRow: { flexDirection: "row", justifyContent: "center" },
  mutedText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
});

/**
 * Forgot password screen for RouteRide Driver.
 *
 * Security: the response is ALWAYS "If this number is registered, a code was sent"
 * regardless of whether the phone exists. This prevents account enumeration.
 */
import { router } from "expo-router";
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
  useZodForm,
  getApiClient,
  colors,
  spacing,
  typography,
} from "@routeride/ui";

const Schema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Enter a valid phone number"),
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriverForgotPasswordScreen() {
  const [sent, setSent] = useState(false);
  const [sentPhone, setSentPhone] = useState("");

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useZodForm({ schema: Schema });

  const onSubmit = async (data: { phone: string }) => {
    // Fire and forget — always show the "sent" UI regardless of outcome
    try {
      await getApiClient().post("/auth/forgot-password", { phone: data.phone });
    } catch {
      // Intentionally swallowed — no enumeration
    }
    setSentPhone(data.phone);
    setSent(true);
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.sentContainer}>
          <Text style={styles.sentIcon}>📱</Text>
          <Text style={styles.title}>Check your phone</Text>
          <Text style={styles.subtitle}>
            If {sentPhone} is registered, a reset code was sent. It expires in 5
            minutes.
          </Text>
          <Button
            variant="primary"
            role="driver"
            onPress={() =>
              router.push({
                pathname: "/(auth)/reset-password",
                params: { phone: sentPhone },
              })
            }
            accessibilityLabel="Enter reset code"
            style={styles.actionBtn}
          >
            Enter code
          </Button>
          <Button
            variant="ghost"
            role="driver"
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            style={styles.actionBtn}
          >
            Back to sign in
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
            <Text style={styles.title}>Reset driver password</Text>
            <Text style={styles.subtitle}>
              Enter your registered phone number and we'll send a reset code.
            </Text>
          </View>

          <Input
            label="Phone number"
            inputId="driver-forgot-phone"
            variant="phone"
            placeholder="+92 300 0000000"
            keyboardType="phone-pad"
            autoComplete="tel"
            error={errors.phone?.message}
            value={watch("phone")}
            onChangeText={(t: string) =>
              setValue("phone", t, { shouldValidate: true })
            }
          />

          <View style={styles.actions}>
            <Button
              variant="primary"
              role="driver"
              loading={isSubmitting}
              onPress={() => handleSubmit(onSubmit)()}
              accessibilityLabel="Send reset code"
            >
              Send reset code
            </Button>
            <Button
              variant="ghost"
              role="driver"
              onPress={() => router.back()}
              accessibilityLabel="Go back to sign in"
            >
              Back to sign in
            </Button>
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
  sentContainer: {
    flex: 1,
    padding: spacing.base,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.base,
  },
  sentIcon: { fontSize: 48, marginBottom: spacing.sm },
  header: { gap: spacing.sm },
  title: {
    ...typography.headlineLgMobile,
    color: colors.onBackground,
    textAlign: "center",
  },
  subtitle: {
    ...typography.bodyLg,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  actions: { gap: spacing.sm },
  actionBtn: { alignSelf: "stretch" },
});

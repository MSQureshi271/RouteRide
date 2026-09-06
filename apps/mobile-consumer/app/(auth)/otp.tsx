/**
 * OTP verification screen (shared flow for both register and forgot-password).
 *
 * Shows:
 *  - 6-segment OTP input (JetBrains Mono)
 *  - Remaining attempts (from 429 response body)
 *  - Lockout state with countdown if the phone is locked
 *  - Resend button with 60s cooldown
 *
 * Navigates to /(app) on successful verification.
 *
 * Security: OTP code is never logged or stored beyond the verification call.
 */
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  OtpInput,
  getApiClient,
  useAuthStore,
  colors,
  spacing,
  typography,
} from "@routeride/ui";

const RESEND_COOLDOWN_SECONDS = 60;

// ─── Component ────────────────────────────────────────────────────────────────

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { setTokens, setUser } = useAuthStore();

  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<
    number | undefined
  >(undefined);
  const [locked, setLocked] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | undefined>(
    undefined,
  );
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Lockout countdown
  useEffect(() => {
    if (!lockoutSeconds || lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((s) => {
        if (s == null || s <= 1) {
          setLocked(false);
          return undefined;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleVerify = async () => {
    if (code.length !== 6 || isSubmitting || locked) return;
    setIsSubmitting(true);
    setServerError(null);

    try {
      const response = await getApiClient().post("/auth/otp/verify", {
        phone,
        code,
      });
      const payload = response.data?.data;
      if (payload?.tokens && payload?.user) {
        await setTokens(payload.tokens, payload.user);
        setUser(payload.user);
        router.replace("/(app)");
      } else {
        router.replace("/(auth)/login");
      }
    } catch (err: unknown) {
      const status = (
        err as {
          response?: {
            status?: number;
            data?: {
              error?: {
                message?: string;
                details?: {
                  attemptsRemaining?: number;
                  lockoutSeconds?: number;
                };
              };
            };
          };
        }
      )?.response?.status;
      const errorData = (
        err as {
          response?: {
            data?: {
              error?: {
                message?: string;
                details?: {
                  attemptsRemaining?: number;
                  lockoutSeconds?: number;
                };
              };
            };
          };
        }
      )?.response?.data?.error;
      const details = errorData?.details;

      if (status === 429) {
        setLocked(true);
        setLockoutSeconds(details?.lockoutSeconds ?? 900);
        setServerError(null);
      } else {
        setAttemptsRemaining(details?.attemptsRemaining);
        setServerError(
          errorData?.message ?? "Incorrect code. Please try again.",
        );
        setCode(""); // Clear boxes on wrong code
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await getApiClient().post("/auth/otp/send", { phone });
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setServerError(null);
      setAttemptsRemaining(undefined);
    } catch {
      setServerError("Could not resend code. Please try again.");
    }
  };

  // Auto-submit when all 6 digits are entered
  useEffect(() => {
    if (code.length === 6) {
      handleVerify();
    }
  }, [code]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Enter code</Text>
            <Text style={styles.subtitle}>
              A 6-digit code was sent to{"\n"}
              <Text style={styles.phone}>{phone}</Text>
            </Text>
          </View>

          {/* OTP input */}
          <OtpInput
            value={code}
            onChange={setCode}
            attemptsRemaining={attemptsRemaining}
            locked={locked}
            lockoutSeconds={lockoutSeconds}
          />

          {/* Server error */}
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

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              variant="primary"
              role="consumer"
              loading={isSubmitting}
              disabled={code.length !== 6 || locked}
              onPress={handleVerify}
              accessibilityLabel="Verify code"
            >
              Verify
            </Button>

            <Button
              variant="ghost"
              role="consumer"
              disabled={resendCooldown > 0 || locked}
              onPress={handleResend}
              accessibilityLabel={
                resendCooldown > 0
                  ? `Resend code in ${resendCooldown} seconds`
                  : "Resend code"
              }
            >
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend code"}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    flex: 1,
    padding: spacing.base,
    justifyContent: "center",
    gap: spacing.xl,
  },
  header: { gap: spacing.sm },
  title: { ...typography.headlineLgMobile, color: colors.onBackground },
  subtitle: { ...typography.bodyLg, color: colors.onSurfaceVariant },
  phone: {
    ...typography.bodyLg,
    color: colors.onSurface,
    fontFamily: "Inter-SemiBold",
  },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorText: { ...typography.bodyMd, color: colors.onErrorContainer },
  actions: { gap: spacing.sm },
});

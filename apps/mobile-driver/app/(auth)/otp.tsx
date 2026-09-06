/**
 * OTP screen for driver app — identical logic to consumer OTP.
 * Uses role="driver" (Safety Emerald) on buttons.
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

const RESEND_COOLDOWN = 60;

export default function DriverOtpScreen() {
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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (!lockoutSeconds || lockoutSeconds <= 0) return;
    const t = setInterval(() => {
      setLockoutSeconds((s) => {
        if (s == null || s <= 1) {
          setLocked(false);
          return undefined;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
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
      } else {
        setAttemptsRemaining(details?.attemptsRemaining);
        setServerError(errorData?.message ?? "Incorrect code.");
        setCode("");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await getApiClient().post("/auth/otp/send", { phone });
      setResendCooldown(RESEND_COOLDOWN);
      setServerError(null);
    } catch {
      setServerError("Could not resend code.");
    }
  };

  useEffect(() => {
    if (code.length === 6) handleVerify();
  }, [code]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Verify your number</Text>
            <Text style={styles.subtitle}>
              6-digit code sent to{"\n"}
              <Text style={styles.phone}>{phone}</Text>
            </Text>
          </View>
          <OtpInput
            value={code}
            onChange={setCode}
            attemptsRemaining={attemptsRemaining}
            locked={locked}
            lockoutSeconds={lockoutSeconds}
          />
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
          <View style={styles.actions}>
            <Button
              variant="primary"
              role="driver"
              loading={isSubmitting}
              disabled={code.length !== 6 || locked}
              onPress={handleVerify}
              accessibilityLabel="Verify code"
            >
              Verify
            </Button>
            <Button
              variant="ghost"
              role="driver"
              disabled={resendCooldown > 0 || locked}
              onPress={handleResend}
              accessibilityLabel={
                resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
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

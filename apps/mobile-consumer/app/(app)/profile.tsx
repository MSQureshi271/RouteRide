/**
 * Consumer Profile Screen — view and edit emergency contact (T0.44).
 *
 * Loads the consumer profile on mount.
 * Allows editing emergencyContactName and emergencyContactPhone.
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
import { ScreenHeader } from "../../src/components/common/ScreenHeader";
import {
  Button,
  Input,
  getApiClient,
  useAuthStore,
  colors,
  spacing,
  typography,
  useZodForm,
} from "@routeride/ui";
import { UpdateConsumerProfileSchema } from "@routeride/contracts";
import type { ConsumerProfile } from "@routeride/contracts";

type UpdateProfileForm = {
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

export default function ConsumerProfileScreen() {
  const { user, logout } = useAuthStore();
  const [_profile, setProfile] = useState<ConsumerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useZodForm({ schema: UpdateConsumerProfileSchema });

  useEffect(() => {
    async function load() {
      try {
        const res = await getApiClient().get("/consumers/me");
        const p = ((res.data as unknown as { data?: ConsumerProfile })?.data ??
          res.data) as ConsumerProfile;
        setProfile(p);
        if (p.emergencyContactName)
          setValue("emergencyContactName", p.emergencyContactName);
        if (p.emergencyContactPhone)
          setValue("emergencyContactPhone", p.emergencyContactPhone);
      } catch {
        setServerError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [setValue]);

  const onSubmit = async (data: UpdateProfileForm) => {
    setServerError(null);
    setSaveSuccess(false);
    try {
      const res = await getApiClient().patch("/consumers/me", data);
      const p = ((res.data as unknown as { data?: ConsumerProfile })?.data ??
        res.data) as ConsumerProfile;
      setProfile(p);
      setSaveSuccess(true);
    } catch {
      setServerError("Failed to save profile. Please try again.");
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="My Profile" testID="profile-header" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="My Profile" testID="profile-header" />
      <SafeAreaView style={styles.innerSafe} edges={["bottom"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* User info */}
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {user?.fullName?.charAt(0).toUpperCase() ?? "U"}
              </Text>
            </View>
            <View>
              <Text style={styles.userName}>{user?.fullName ?? "Parent"}</Text>
              <Text style={styles.userPhone}>{user?.phone ?? ""}</Text>
            </View>
          </View>

          {/* Emergency contact section */}
          <Text style={styles.sectionLabel}>Emergency Contact</Text>
          <Text style={styles.sectionHint}>
            This person will be contacted if there's an urgent situation
            involving your rider.
          </Text>

          {serverError && (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              accessible
            >
              <Text style={styles.errorText}>{serverError}</Text>
            </View>
          )}

          {saveSuccess && (
            <View
              style={styles.successBanner}
              accessibilityLiveRegion="polite"
              accessible
            >
              <Text style={styles.successText}>
                ✓ Profile saved successfully
              </Text>
            </View>
          )}

          <Input
            label="Emergency contact name"
            inputId="profile-emergency-name"
            placeholder="Amina Khan (Mother)"
            autoComplete="name"
            error={errors.emergencyContactName?.message}
            value={watch("emergencyContactName") ?? ""}
            onChangeText={(t) => {
              setSaveSuccess(false);
              setValue("emergencyContactName", t, { shouldValidate: true });
            }}
          />

          <Input
            label="Emergency contact phone"
            inputId="profile-emergency-phone"
            variant="phone"
            placeholder="+923001234567"
            keyboardType="phone-pad"
            hint="E.164 format, e.g. +923001234567"
            error={errors.emergencyContactPhone?.message}
            value={watch("emergencyContactPhone") ?? ""}
            onChangeText={(t) => {
              setSaveSuccess(false);
              setValue("emergencyContactPhone", t, { shouldValidate: true });
            }}
          />

          <View style={styles.actions}>
            <Button
              variant="primary"
              role="consumer"
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit as never)}
              accessibilityLabel="Save profile"
            >
              Save Profile
            </Button>

            <Button
              variant="secondary"
              role="consumer"
              onPress={() => logout()}
              accessibilityLabel="Log out"
              style={styles.logoutBtn}
            >
              Log out
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  innerSafe: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { flexGrow: 1, padding: spacing.base, gap: spacing.base },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryContainer,
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: { ...typography.headlineMd, color: colors.inversePrimary },
  userName: {
    ...typography.bodyMd,
    color: colors.onSurface,
    fontFamily: "Manrope-SemiBold",
  },
  userPhone: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  sectionLabel: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    marginTop: spacing.sm,
  },
  sectionHint: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorText: { ...typography.bodyMd, color: colors.onErrorContainer },
  successBanner: {
    backgroundColor: colors.secondaryContainer,
    borderRadius: 8,
    padding: spacing.md,
  },
  successText: { ...typography.bodyMd, color: colors.onSecondaryContainer },
  actions: { gap: spacing.md, paddingTop: spacing.lg },
  logoutBtn: { marginTop: spacing.sm },
});

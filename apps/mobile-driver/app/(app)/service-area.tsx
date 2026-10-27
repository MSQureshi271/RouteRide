import React, { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Button,
  colors,
  getApiClient,
  spacing,
  typography,
} from "@routeride/ui";
import type { DriverServiceAreaSettings } from "@routeride/contracts";
import { ServiceAreaEditor } from "../../src/service-area/ServiceAreaEditor";

export default function ServiceAreaScreen() {
  const [settings, setSettings] = useState<DriverServiceAreaSettings | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    setMessage(null);
    if (!settings) {
      setMessage(
        "Choose a service area, starting location, and confirm at least one valid driving-hours range.",
      );
      return;
    }
    setSaving(true);
    try {
      await getApiClient().put("/drivers/me/service-area", settings);
      setMessage("Your service area and driving hours have been saved.");
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      setMessage(
        status === 409
          ? "These changes conflict with existing rider commitments. Keep their coverage and agreed times, or resolve the commitments first."
          : status === 422
            ? "Your starting location or route is outside the supported area. Adjust it and try again."
            : "Could not save your driving hours. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Button
          accessibilityLabel="Back"
          variant="secondary"
          role="driver"
          onPress={() => router.back()}
        >
          Back
        </Button>
        <ServiceAreaEditor onChange={setSettings} />
        {message && (
          <Text accessibilityRole="alert" style={styles.message}>
            {message}
          </Text>
        )}
        <Button
          accessibilityLabel="Save service-area settings"
          role="driver"
          loading={saving}
          onPress={() => void save()}
        >
          Save service-area settings
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, gap: spacing.base },
  message: { ...typography.bodyMd, color: colors.onSurface },
});

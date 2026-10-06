/**
 * LocationDropdown — Development/Test dropdown for selecting pre-defined Karachi locations.
 *
 * Designed to enable zero-friction testing of driver routes and consumer rider onboarding
 * without requiring Google Maps API keys or manual address entry.
 *
 * Gating: Only renders when __DEV__ is true (or when forceShow is set).
 */
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BUILTIN_LOCATIONS, type BuiltinLocation } from "@routeride/contracts";
import { colors, fontFamilies, radii, spacing } from "../tokens";

declare const __DEV__: boolean | undefined;

export interface LocationDropdownProps {
  label?: string | undefined;
  placeholder?: string | undefined;
  onSelect: (location: BuiltinLocation) => void;
  selectedLocationId?: string | undefined;
  disabled?: boolean | undefined;
  testID?: string | undefined;
  /** Force display even when not in __DEV__ (default false: only renders in __DEV__) */
  forceShow?: boolean | undefined;
}

export function LocationDropdown({
  label = "Select Built-in Location",
  placeholder = "Choose a test location",
  onSelect,
  selectedLocationId,
  disabled = false,
  testID = "location-dropdown",
  forceShow = false,
}: LocationDropdownProps) {
  const [modalVisible, setModalVisible] = useState(false);

  // Development-only gate: do not expose sample testing locations in production builds
  const isDevEnvironment =
    typeof __DEV__ !== "undefined" ? Boolean(__DEV__) : true;

  if (!isDevEnvironment && !forceShow) {
    return null;
  }

  const selectedLoc = BUILTIN_LOCATIONS.find(
    (loc) => loc.id === selectedLocationId,
  );

  const handleSelect = (loc: BuiltinLocation) => {
    onSelect(loc);
    setModalVisible(false);
  };

  return (
    <View style={styles.container} testID={testID}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <View style={styles.devBadge}>
            <Text style={styles.devBadgeText}>DEV PRESET</Text>
          </View>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.triggerButton, disabled && styles.triggerDisabled]}
        onPress={() => setModalVisible(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLoc ? selectedLoc.name : placeholder}`}
      >
        <Text style={styles.pinIcon}>📍</Text>
        <Text
          style={[styles.triggerText, !selectedLoc && styles.placeholderText]}
          numberOfLines={1}
        >
          {selectedLoc
            ? `${selectedLoc.name} (${selectedLoc.area})`
            : placeholder}
        </Text>
        <Text style={styles.caret}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <SafeAreaView style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Built-in Test Locations</Text>
                  <Text style={styles.modalSubtitle}>
                    Curated Karachi locations with valid coordinates
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setModalVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close location picker"
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={BUILTIN_LOCATIONS}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const isSelected = item.id === selectedLocationId;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.locationItem,
                        isSelected && styles.locationItemSelected,
                      ]}
                      onPress={() => handleSelect(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${item.name}`}
                    >
                      <View style={styles.locationHeaderRow}>
                        <Text style={styles.locationName}>{item.name}</Text>
                        <View style={styles.areaBadge}>
                          <Text style={styles.areaBadgeText}>{item.area}</Text>
                        </View>
                      </View>
                      <Text style={styles.locationAddress}>{item.address}</Text>
                      <Text style={styles.locationCoords}>
                        {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemiBold,
    color: colors.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  devBadge: {
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  devBadgeText: {
    fontSize: 9,
    fontFamily: fontFamilies.mono,
    color: colors.primary,
    fontWeight: "700",
  },
  triggerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    minHeight: 44,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  pinIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamilies.bodyMedium,
    color: colors.onSurface,
  },
  placeholderText: {
    color: colors.onSurfaceVariant,
  },
  caret: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
    marginLeft: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "75%",
    minHeight: 350,
  },
  modalInner: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: fontFamilies.headlineBold,
    color: colors.onSurface,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  closeButton: {
    padding: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 14,
    color: colors.onSurface,
    fontWeight: "bold",
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  locationItem: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  locationItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryContainer,
  },
  locationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  locationName: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemiBold,
    color: colors.onSurface,
    flex: 1,
  },
  areaBadge: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  areaBadgeText: {
    fontSize: 10,
    fontFamily: fontFamilies.bodyMedium,
    color: colors.onSurfaceVariant,
  },
  locationAddress: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  locationCoords: {
    fontSize: 10,
    fontFamily: fontFamilies.mono,
    color: colors.outline,
    marginTop: 4,
  },
});

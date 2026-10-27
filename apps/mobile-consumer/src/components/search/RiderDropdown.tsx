import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, spacing, radii, typography } from "@routeride/ui";
import type { Rider } from "@routeride/contracts";
import { useRouter } from "expo-router";

export interface RiderDropdownProps {
  riders: Rider[];
  selectedRiderId: string;
  onSelectRider: (rider: Rider) => void;
}

export function RiderDropdown({
  riders,
  selectedRiderId,
  onSelectRider,
}: RiderDropdownProps) {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedRider = riders.find((r) => r.id === selectedRiderId) ?? riders[0];
  const initial = selectedRider?.name.trim().charAt(0).toUpperCase() || "R";

  return (
    <View style={styles.container}>
      {/* Trigger Card */}
      <TouchableOpacity
        style={styles.triggerCard}
        onPress={() => setModalVisible(true)}
        accessibilityRole="combobox"
        accessibilityLabel={`Select passenger. Currently selected: ${selectedRider?.name ?? "None"}`}
        testID="rider-dropdown-trigger"
        activeOpacity={0.8}
      >
        <View style={styles.leftRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.riderName} numberOfLines={1}>
            {selectedRider?.name ?? "Select Rider"}
          </Text>
        </View>

        <Text style={styles.chevronIcon}>⌄</Text>
      </TouchableOpacity>

      {/* Modal Picker Sheet */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Passenger / Rider</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close rider picker"
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.riderList}>
              {riders.map((rider) => {
                const isSelected = rider.id === selectedRider?.id;
                const rInitial = rider.name.trim().charAt(0).toUpperCase() || "R";

                return (
                  <TouchableOpacity
                    key={rider.id}
                    style={[
                      styles.riderOption,
                      isSelected && styles.riderOptionSelected,
                    ]}
                    onPress={() => {
                      onSelectRider(rider);
                      setModalVisible(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    testID={`rider-option-${rider.id}`}
                  >
                    <View style={styles.optionLeft}>
                      <View
                        style={[
                          styles.optionAvatar,
                          isSelected && styles.optionAvatarSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionAvatarText,
                            isSelected && styles.optionAvatarTextSelected,
                          ]}
                        >
                          {rInitial}
                        </Text>
                      </View>
                      <View style={styles.optionMeta}>
                        <Text style={styles.optionName}>{rider.name}</Text>
                        <Text style={styles.optionCorridor} numberOfLines={1}>
                          {rider.homeAddressText} → {rider.destAddressText}
                        </Text>
                      </View>
                    </View>

                    {isSelected && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.addRiderBtn}
              onPress={() => {
                setModalVisible(false);
                router.push("/(app)/riders/add");
              }}
              accessibilityRole="button"
              accessibilityLabel="Add new rider"
              testID="add-new-rider-btn"
            >
              <Text style={styles.addRiderText}>+ Add New Rider</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  triggerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.onPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  riderName: {
    ...typography.headlineMd,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: colors.onSurface,
    flex: 1,
  },
  chevronIcon: {
    fontSize: 20,
    color: colors.onSurface,
    fontWeight: "700",
    marginLeft: spacing.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.md,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.headlineMd,
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: 18,
    color: colors.onSurfaceVariant,
    fontWeight: "600",
  },
  riderList: {
    maxHeight: 280,
  },
  riderOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  riderOptionSelected: {
    backgroundColor: colors.surfaceContainerLow,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  optionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: "center",
    justifyContent: "center",
  },
  optionAvatarSelected: {
    backgroundColor: colors.primary,
  },
  optionAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  optionAvatarTextSelected: {
    color: colors.onPrimary,
  },
  optionMeta: {
    flex: 1,
  },
  optionName: {
    ...typography.bodyMd,
    fontWeight: "700",
    color: colors.onSurface,
  },
  optionCorridor: {
    ...typography.bodyMd,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  addRiderBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  addRiderText: {
    ...typography.bodyMd,
    fontWeight: "700",
    color: colors.primary,
  },
});

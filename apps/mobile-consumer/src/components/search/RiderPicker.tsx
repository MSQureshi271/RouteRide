import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, spacing, typography, radii } from "@routeride/ui";
import type { Rider } from "@routeride/contracts";

export interface RiderPickerProps {
  riders: Rider[];
  selectedRiderId: string;
  onSelectRider: (rider: Rider) => void;
}

export function RiderPicker({
  riders,
  selectedRiderId,
  onSelectRider,
}: RiderPickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Select Passenger / Rider</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollList}
      >
        {riders.map((rider) => {
          const isSelected = rider.id === selectedRiderId;
          const initial = rider.name.trim().charAt(0).toUpperCase() || "R";

          return (
            <TouchableOpacity
              key={rider.id}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => onSelectRider(rider)}
              accessibilityRole="button"
              accessibilityLabel={`Select rider ${rider.name}`}
              accessibilityState={{ selected: isSelected }}
              testID={`rider-chip-${rider.id}`}
              activeOpacity={0.8}
            >
              <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
                <Text style={[styles.avatarText, isSelected && styles.avatarTextSelected]}>
                  {initial}
                </Text>
              </View>
              <View style={styles.info}>
                <Text
                  style={[styles.name, isSelected && styles.nameSelected]}
                  numberOfLines={1}
                >
                  {rider.name}
                </Text>
                <Text
                  style={[styles.dest, isSelected && styles.destSelected]}
                  numberOfLines={1}
                >
                  {rider.destAddressText}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.bodyMd,
    fontFamily: "Manrope-SemiBold",
    color: colors.onSurface,
  },
  scrollList: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    minWidth: 160,
    maxWidth: 220,
    minHeight: 56,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerLow,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSelected: {
    backgroundColor: colors.primary,
  },
  avatarText: {
    ...typography.bodyMd,
    fontFamily: "Manrope-SemiBold",
    color: colors.onSurfaceVariant,
    fontWeight: "700",
  },
  avatarTextSelected: {
    color: colors.onPrimary,
  },
  info: {
    flex: 1,
  },
  name: {
    ...typography.bodyMd,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: colors.onSurface,
  },
  nameSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  dest: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  destSelected: {
    color: colors.onSurface,
  },
});

/**
 * Riders List Screen — consumer rider management.
 *
 * Displays all riders belonging to the authenticated consumer.
 * Features:
 *  - FlatList with rider cards (name, home, destination)
 *  - Empty state with invitation to add a first rider
 *  - Delete with confirmation sheet naming the consequence
 *  - 409 delete-conflict shown as a readable message (not a raw 409)
 *  - Loading and error states
 */
import React, { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import {
  EmptyState,
  getApiClient,
  colors,
  spacing,
  typography,
} from "@routeride/ui";
import type { Rider } from "@routeride/contracts";

// ─── Rider Card ───────────────────────────────────────────────────────────────

function RiderCard({
  rider,
  onDelete,
  onEdit,
}: {
  rider: Rider;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  return (
    <View style={styles.card} accessibilityRole="button" accessible>
      <View style={styles.cardMain}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {rider.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.riderName}>{rider.name}</Text>
          <Text style={styles.riderAddress} numberOfLines={1}>
            🏠 {rider.homeAddressText}
          </Text>
          <Text style={styles.riderAddress} numberOfLines={1}>
            🏫 {rider.destAddressText}
          </Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onEdit(rider.id)}
          accessibilityLabel={`Edit ${rider.name}`}
          accessibilityRole="button"
          testID={`edit-rider-${rider.id}`}
        >
          <Text style={styles.actionBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => onDelete(rider.id)}
          accessibilityLabel={`Delete ${rider.name}`}
          accessibilityRole="button"
          testID={`delete-rider-${rider.id}`}
        >
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RidersIndexScreen() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRiders = useCallback(async () => {
    try {
      const res = await getApiClient().get("/consumers/me/riders");
      const list = ((res.data as unknown as { data?: Rider[] })?.data ??
        res.data) as Rider[];
      setRiders(Array.isArray(list) ? list : []);
      setError(null);
    } catch {
      setError("Failed to load riders. Pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchRiders();
    }, [fetchRiders]),
  );

  const handleDelete = (riderId: string) => {
    const rider = riders.find((r) => r.id === riderId);
    Alert.alert(
      "Delete Rider",
      `Remove ${rider?.name ?? "this rider"} from your account? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await getApiClient().delete(`/consumers/me/riders/${riderId}`);
              setRiders((prev) => prev.filter((r) => r.id !== riderId));
            } catch (err: unknown) {
              const status = (err as { response?: { status?: number } })
                ?.response?.status;
              if (status === 409) {
                Alert.alert(
                  "Cannot Delete Rider",
                  `${rider?.name ?? "This rider"} has an active route subscription. Please cancel the subscription first, then delete the rider.`,
                  [{ text: "OK" }],
                );
              } else {
                Alert.alert(
                  "Error",
                  "Failed to delete rider. Please try again.",
                );
              }
            }
          },
        },
      ],
    );
  };

  const handleEdit = (riderId: string) => {
    router.push(`/(app)/riders/${riderId}/edit` as never);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={riders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchRiders();
            }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Text style={{ fontSize: 32 }}>🎒</Text>}
            title="No riders yet"
            subtitle="Add your first rider to start searching for school routes."
            action={{
              label: "Add a Rider",
              onPress: () => router.push("/(app)/riders/add" as never),
            }}
          />
        }
        renderItem={({ item }) => (
          <RiderCard rider={item} onDelete={handleDelete} onEdit={handleEdit} />
        )}
      />

      {/* FAB-style add button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/(app)/riders/add" as never)}
        accessibilityLabel="Add a new rider"
        accessibilityRole="button"
        testID="add-rider-fab"
      >
        <Text style={styles.fabText}>+ Add Rider</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: {
    flexGrow: 1,
    padding: spacing.base,
    gap: spacing.md,
    paddingBottom: 100, // space for FAB
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    gap: spacing.sm,
  },
  cardMain: { flexDirection: "row", gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryContainer,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...typography.headlineMd,
    color: colors.inversePrimary,
  },
  cardInfo: { flex: 1, gap: 4 },
  riderName: {
    ...typography.bodyMd,
    color: colors.onSurface,
    fontFamily: "Inter-Medium",
  },
  riderAddress: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  actionBtnText: { ...typography.bodyMd, color: colors.onSurface },
  deleteBtn: {
    borderColor: colors.error,
    backgroundColor: colors.errorContainer,
  },
  deleteBtnText: { ...typography.bodyMd, color: colors.onErrorContainer },
  errorText: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    bottom: spacing.xl,
    right: spacing.base,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  fabText: {
    ...typography.bodyMd,
    color: colors.onPrimary,
    fontFamily: "Manrope-SemiBold",
  },
});

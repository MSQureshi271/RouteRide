/**
 * Consumer In-App Notification Centre.
 *
 * Fetches notifications from GET /notifications.
 * Allows tapping on a notification to mark it as read and navigate via deep-link.
 * Uses DESIGN.md tokens, Card, Badge, EmptyState, and Skeleton.
 */
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { ScreenHeader } from "../../src/components/common/ScreenHeader";
import {
  getApiClient,
  Badge,
  type BadgeVariant,
  Card,
  CardBody,
  EmptyState,
  Skeleton,
  colors,
  spacing,
  typography,
  resolveNotificationRoute,
} from "@routeride/ui";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  isRead: boolean;
  createdAt: string;
}

function getBadgeVariant(type: string): BadgeVariant {
  if (type.includes("COMPLETED") || type.includes("CONFIRMED"))
    return "success";
  if (type.includes("DELAY") || type.includes("WARNING")) return "warning";
  if (type.includes("CANCELLED") || type.includes("FAILED")) return "error";
  if (type.includes("EN_ROUTE") || type.includes("APPROACHING")) return "route";
  return "neutral";
}

export default function ConsumerNotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await getApiClient().get("/notifications?limit=50");
      setNotifications(res.data.data.data || []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleNotificationPress = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await getApiClient().patch(`/notifications/${item.id}/read`);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
        );
      } catch (err) {
        console.warn("Failed to mark notification read", err);
      }
    }

    const route = resolveNotificationRoute("consumer", {
      type: item.type,
      ...item.data,
    });
    if (route && route !== "/(app)/notifications") {
      router.push(route as Parameters<typeof router.push>[0]);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Notifications" testID="notifications-header" />
        <View style={styles.skeletonList}>
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notifications" testID="notifications-header" />

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchNotifications();
            }}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Text style={{ fontSize: 40 }}>🔔</Text>}
            title="All caught up"
            subtitle="You have no notifications at this time."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleNotificationPress(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.isRead ? "" : "Unread: "}${item.title}. ${item.body}`}
          >
            <Card style={[styles.notifCard, !item.isRead && styles.unreadCard]}>
              <CardBody style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <Badge
                    variant={getBadgeVariant(item.type)}
                    label={item.type.replace(/_/g, " ")}
                  />
                  <Text style={styles.timestamp}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text
                  style={[styles.title, !item.isRead && styles.unreadTitle]}
                >
                  {item.title}
                </Text>
                <Text style={styles.body}>{item.body}</Text>
              </CardBody>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerTitle: {
    ...typography.headlineMd,
    color: colors.onSurface,
  },
  listContent: {
    padding: spacing.base,
    gap: spacing.sm,
    flexGrow: 1,
  },
  skeletonList: {
    padding: spacing.base,
    gap: spacing.md,
  },
  notifCard: {
    marginBottom: spacing.xs,
  },
  unreadCard: {
    borderColor: colors.primary,
    borderLeftWidth: 4,
    backgroundColor: colors.surfaceContainerLow,
  },
  cardBody: {
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  timestamp: {
    ...typography.dataMono,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  title: {
    ...typography.bodyLg,
    fontFamily: "Inter-SemiBold",
    color: colors.onSurface,
  },
  unreadTitle: {
    color: colors.primary,
  },
  body: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
  },
});

/**
 * Driver app shell — route-gated for authenticated DRIVER users.
 *
 * Uses Safety Emerald as the active tab tint.
 */
import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useAuthStore, type AuthState, colors } from "@routeride/ui";

export default function DriverAppLayout() {
  const accessToken = useAuthStore((s: AuthState) => s.accessToken);

  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.secondary, // Safety Emerald for driver
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: colors.surfaceContainerLowest,
          borderTopColor: colors.outlineVariant,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20 }}>🚗</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20 }}>🔔</Text>
          ),
        }}
      />
    </Tabs>
  );
}

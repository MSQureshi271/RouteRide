/**
 * Consumer app shell — route-gated for authenticated CONSUMER users.
 *
 * Tabs: Home, Riders, Profile, Notifications
 *
 * Source: https://docs.expo.dev/router/layouts/tabs/
 */
import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useAuthStore, type AuthState, colors } from "@routeride/ui";

export default function AppLayout() {
  const accessToken = useAuthStore((s: AuthState) => s.accessToken);

  // Guard: unauthenticated → auth flow
  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
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
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20 }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="riders"
        options={{
          title: "Riders",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20 }}>👧</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 20 }}>👤</Text>
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
      <Tabs.Screen
        name="search"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

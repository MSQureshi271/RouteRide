/**
 * Consumer app shell — route-gated for authenticated CONSUMER users.
 *
 * Redirects unauthenticated users to the login screen.
 * The tab bar is a stub for now; feature tabs will be added in future tasks.
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

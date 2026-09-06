/**
 * Auth group layout for the consumer app.
 *
 * Redirects authenticated users away from auth screens back to the main app.
 * Source: https://docs.expo.dev/router/layouts/
 */
import { Redirect, Stack } from "expo-router";
import { useAuthStore, type AuthState } from "@routeride/ui";

export default function AuthLayout() {
  const accessToken = useAuthStore((s: AuthState) => s.accessToken);

  // Already authenticated → skip the auth flow
  if (accessToken) {
    return <Redirect href="/(app)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}

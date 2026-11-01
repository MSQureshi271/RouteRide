/**
 * Auth group layout for the driver app.
 * Redirects authenticated drivers away from auth screens.
 */
import { Redirect, Stack } from "expo-router";
import type { JSX } from "react";
import { useAuthStore, type AuthState } from "@routeride/ui";

export default function AuthLayout(): JSX.Element {
  const accessToken = useAuthStore((s: AuthState) => s.accessToken);

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

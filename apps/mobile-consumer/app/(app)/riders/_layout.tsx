/**
 * Riders stack layout for the consumer app.
 */
import { Stack } from "expo-router";
import { colors } from "@routeride/ui";

export default function RidersLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceContainerLowest },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontFamily: "Manrope-SemiBold" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "My Riders" }} />
      <Stack.Screen name="add" options={{ title: "Add Rider" }} />
      <Stack.Screen name="[riderId]/edit" options={{ title: "Edit Rider" }} />
    </Stack>
  );
}

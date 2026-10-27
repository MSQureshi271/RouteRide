/**
 * Driver app root layout.
 *
 * Responsibilities:
 *  - Loads DESIGN.md fonts (Manrope, Inter, JetBrains Mono)
 *  - Bootstraps auth state via silent refresh
 *  - Wraps app in TanStack QueryClientProvider
 *  - Route guard: unauthenticated users → /(auth)/login
 *
 * Source: https://docs.expo.dev/router/layouts/
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useFonts,
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import Constants from "expo-constants";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar as RNStatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initApiClient, useAuthStore } from "@routeride/ui";

SplashScreen.preventAutoHideAsync();

const debuggerHost = Constants.expoConfig?.hostUri?.split(":")[0];
const API_BASE_URL =
  process.env["EXPO_PUBLIC_API_URL"] ??
  (debuggerHost
    ? `http://${debuggerHost}:3000/api/v1`
    : "http://localhost:3000/api/v1");
initApiClient(API_BASE_URL);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { setBootstrapping, setTokens, logout, getRefreshToken } =
    useAuthStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          setBootstrapping(false);
          return;
        }
        const { getApiClient } = await import("@routeride/ui");
        const response = await getApiClient().post("/auth/refresh", {
          refreshToken,
        });
        const { accessToken, refreshToken: newRefreshToken } =
          response.data.data;
        await setTokens(
          { accessToken, refreshToken: newRefreshToken },
          response.data.data.user,
        );
      } catch {
        await logout();
      } finally {
        setBootstrapping(false);
        await SplashScreen.hideAsync();
      }
    }
    bootstrap();
  }, []);

  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  if (isBootstrapping) return null;

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "Manrope-Regular": Manrope_400Regular,
    "Manrope-SemiBold": Manrope_600SemiBold,
    "Manrope-Bold": Manrope_700Bold,
    "Inter-Regular": Inter_400Regular,
    "Inter-Medium": Inter_500Medium,
    "Inter-SemiBold": Inter_600SemiBold,
    "JetBrainsMono-Medium": JetBrainsMono_500Medium,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <RNStatusBar
        barStyle="dark-content"
        backgroundColor="#ffffff"
        translucent={false}
      />
      <StatusBar style="dark" />
      <QueryClientProvider client={queryClient}>
        <AuthBootstrap>
          <Slot />
        </AuthBootstrap>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

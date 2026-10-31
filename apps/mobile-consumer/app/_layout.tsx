/**
 * Consumer app root layout.
 *
 * Responsibilities:
 *  - Loads custom fonts (Manrope, Inter, JetBrains Mono) from DESIGN.md
 *  - Bootstraps auth state: reads the refresh token from SecureStore, performs
 *    a silent refresh to populate accessToken in RAM, then hides the splash screen.
 *  - Wraps the entire app in the TanStack QueryClientProvider.
 *  - Route guard: unauthenticated users are redirected to /(auth)/login.
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
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initApiClient, useAuthStore } from "@routeride/ui";

// Keep splash screen visible until fonts + auth bootstrap complete
SplashScreen.preventAutoHideAsync();

// Initialise the API client with the environment base URL or auto-detected Metro host IP
const debuggerHost = Constants.expoConfig?.hostUri?.split(":")[0];
const API_BASE_URL =
  process.env["EXPO_PUBLIC_API_URL"] ??
  (debuggerHost
    ? `http://${debuggerHost}:3000/api/v1`
    : "http://localhost:3000/api/v1");
initApiClient(API_BASE_URL);

// TanStack Query client with sane defaults for a mobile app
// Source: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 minute before data is considered stale
      gcTime: 5 * 60_000, // 5 minutes before inactive cache is garbage-collected
      retry: 1, // one automatic retry on failure
      refetchOnWindowFocus: false, // disable browser-style refetch (mobile context)
    },
    mutations: {
      retry: 0,
    },
  },
});

// ─── Bootstrap component ──────────────────────────────────────────────────────

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { setBootstrapping, setTokens, logout, getRefreshToken } =
    useAuthStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const storedRefreshToken = await getRefreshToken();
        if (!storedRefreshToken) {
          setBootstrapping(false);
          await SplashScreen.hideAsync();
          return;
        }

        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: storedRefreshToken }),
        });

        if (!response.ok) {
          await logout();
          return;
        }

        const json = await response.json();
        await setTokens(json.data.accessToken, json.data.refreshToken);
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

  if (isBootstrapping) {
    // Keep the splash screen up while bootstrapping
    return null;
  }

  return <>{children}</>;
}

// ─── Root layout ─────────────────────────────────────────────────────────────

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

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <QueryClientProvider client={queryClient}>
        <AuthBootstrap>
          <Slot />
        </AuthBootstrap>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * Axios API client with single-flight 401 refresh interceptor.
 *
 * Security contract enforced here:
 *  - Access token is read from the Zustand store (in-memory) on every request.
 *  - Two concurrent 401s trigger exactly ONE refresh call; the second waits.
 *  - A failed refresh calls logout() and rejects all queued requests.
 *  - No token is ever written to disk inside this module.
 *
 * Refresh pattern source:
 *  https://axios-http.com/docs/interceptors
 *  Single-flight queue pattern per well-established React Native auth patterns.
 */
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { useAuthStore } from "../store/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueEntry {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}

// ─── State (module-level, not component state) ────────────────────────────────

let isRefreshing = false;
let failedQueue: QueueEntry[] = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((entry) => {
    if (error) {
      entry.reject(error);
    } else {
      entry.resolve(token as string);
    }
  });
  failedQueue = [];
}

export function _resetClientStateForTesting(): void {
  isRefreshing = false;
  failedQueue = [];
}

// ─── Client factory ───────────────────────────────────────────────────────────

/**
 * Creates a configured Axios instance for RouteRide API calls.
 * Pass the API base URL from environment configuration.
 */
export function createApiClient(baseURL: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 15_000,
    headers: { "Content-Type": "application/json" },
  });

  // ── Request interceptor: inject Bearer token ──────────────────────────────
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = useAuthStore.getState().accessToken;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // ── Response interceptor: single-flight refresh on 401 ───────────────────
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      // Only handle 401 Unauthorized. Skip if already retried or if the request is to the refresh endpoint itself.
      if (
        error.response?.status !== 401 ||
        originalRequest._retry ||
        originalRequest.url?.includes("/auth/refresh")
      ) {
        return Promise.reject(error);
      }

      // If a refresh is already in flight, queue this request.
      if (isRefreshing) {
        return new Promise<AxiosResponse>((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(client(originalRequest));
            },
            reject,
          });
        });
      }

      // First 401 — mark as retried and start the refresh.
      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const store = useAuthStore.getState();
        const refreshToken = await store.getRefreshToken();

        if (!refreshToken) {
          throw new Error("No refresh token available");
        }

        // Call the refresh endpoint directly (no interceptor loop — baseURL is set)
        const refreshResponse = await client.post<{
          data: { accessToken: string; refreshToken: string };
        }>("/auth/refresh", { refreshToken });

        const { accessToken: newAccess, refreshToken: newRefresh } =
          refreshResponse.data.data;

        // Persist new tokens
        await store.setTokens({
          accessToken: newAccess,
          refreshToken: newRefresh,
        });

        // Flush queued requests with the new token
        processQueue(null, newAccess);

        // Retry the original request
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return client(originalRequest);
      } catch (refreshError) {
        // Refresh failed — log the user out and reject all queued requests
        processQueue(refreshError, null);
        await useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    },
  );

  return client;
}

// ─── Default client singleton ─────────────────────────────────────────────────

/**
 * Pre-built singleton for use across the app.
 * The base URL is injected from expo-constants / process.env at app startup.
 * Re-export this from your app's entry point after setting the URL.
 */
let _apiClient: AxiosInstance | null = null;

export function initApiClient(baseURL: string): AxiosInstance {
  _apiClient = createApiClient(baseURL);
  return _apiClient;
}

export function getApiClient(): AxiosInstance {
  if (!_apiClient) {
    throw new Error(
      "API client not initialised. Call initApiClient(baseURL) in your app entry point before making requests.",
    );
  }
  return _apiClient;
}

/**
 * Resolves pre-signed upload URLs for mobile environments.
 *
 * In local development, the backend pre-signs S3 URLs using AWS_ENDPOINT_URL
 * (typically http://localhost:4566). When running on a physical mobile device or
 * emulator, "localhost" points to the device itself.
 *
 * This function checks if the upload URL's hostname is localhost or 127.0.0.1.
 * If so, and the API client was initialized with a remote host (e.g. 192.168.x.x
 * or 10.0.2.2 via Expo Constants), it rewrites the hostname to match the API host,
 * preserving the port, path, and signed query parameters.
 *
 * In production (real S3 / CloudFront), the hostname is not localhost, so the URL
 * remains completely untouched.
 */
export function resolveUploadUrl(uploadUrl: string): string {
  try {
    const parsedUpload = new URL(uploadUrl);
    if (
      parsedUpload.hostname === "localhost" ||
      parsedUpload.hostname === "127.0.0.1"
    ) {
      const apiBase = _apiClient?.defaults.baseURL;
      if (apiBase) {
        const parsedApi = new URL(apiBase);
        if (
          parsedApi.hostname &&
          parsedApi.hostname !== "localhost" &&
          parsedApi.hostname !== "127.0.0.1"
        ) {
          parsedUpload.hostname = parsedApi.hostname;
          return parsedUpload.toString();
        }
      }
    }
  } catch {
    // If URL parsing fails, return original
  }
  return uploadUrl;
}

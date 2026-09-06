/**
 * Auth store — access token is kept in memory ONLY.
 * Refresh token is persisted in expo-secure-store.
 *
 * Security contract:
 *  - accessToken: lives in Zustand state (RAM), never written to disk.
 *  - refreshToken: written to expo-secure-store, read on app boot.
 *  - AsyncStorage: must never contain either token (verified in tests).
 *
 * Source: https://docs.expo.dev/versions/latest/sdk/securestore/
 */
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import type { UserSummary } from "@routeride/contracts";

const REFRESH_TOKEN_KEY = "rr_refresh_token";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthState {
  /** Access token: in-memory only, never persisted. */
  accessToken: string | null;
  /** Authenticated user summary. */
  user: UserSummary | null;
  /** True while the initial silent-refresh boot attempt is running. */
  isBootstrapping: boolean;

  // ─── Actions ───────────────────────────────────────────────────────────────

  /**
   * Stores tokens after a successful login or refresh.
   * Access token → in-memory.
   * Refresh token → SecureStore.
   */
  setTokens: (
    tokens: { accessToken: string; refreshToken: string },
    user?: UserSummary,
  ) => Promise<void>;

  /**
   * Replaces the in-memory access token after a silent refresh.
   * Does not write to SecureStore (the refresh token is unchanged).
   */
  setAccessToken: (token: string) => void;

  /**
   * Reads stored refresh token from SecureStore and returns it.
   * Returns null if none is stored.
   */
  getRefreshToken: () => Promise<string | null>;

  /**
   * Clears in-memory state and removes the refresh token from SecureStore.
   * Called on explicit logout or when the refresh cycle fails.
   */
  logout: () => Promise<void>;

  /** Called once during app bootstrap to attempt a silent token refresh. */
  setBootstrapping: (value: boolean) => void;

  /** Set the authenticated user (after a successful refresh that returns user info). */
  setUser: (user: UserSummary | null) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isBootstrapping: true,

  setTokens: async ({ accessToken, refreshToken }, user) => {
    // Write refresh token to secure storage
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    // Keep access token in memory only
    set({ accessToken, user: user ?? null });
  },

  setAccessToken: (token) => {
    set({ accessToken: token });
  },

  getRefreshToken: async () => {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {
      // Ignore errors on delete — the token may already be absent
    });
    set({ accessToken: null, user: null });
  },

  setBootstrapping: (value) => {
    set({ isBootstrapping: value });
  },

  setUser: (user) => {
    set({ user });
  },
}));

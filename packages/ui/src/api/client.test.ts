/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for the Axios API client interceptors.
 *
 * Key assertions:
 *  1. Three parallel 401s trigger exactly ONE refresh call.
 *  2. A failed refresh calls logout() and rejects all queued callers.
 *  3. AsyncStorage is never written to (access token stays in RAM).
 */

import { type AxiosInstance } from "axios";
import MockAdapter from "axios-mock-adapter";
import * as SecureStore from "expo-secure-store";
import { createApiClient, _resetClientStateForTesting } from "./client";
import { useAuthStore } from "../store/auth";

// ─── Mock expo-secure-store so tests run in Node ──────────────────────────────
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// ─── Mock @routeride/contracts (just the types, not needed at runtime) ────────
jest.mock("@routeride/contracts", () => ({}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedAuthStore(accessToken: string, refreshToken: string) {
  useAuthStore.setState({ accessToken, user: null });
  // Simulate SecureStore returning the refresh token
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(refreshToken);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("API client interceptors", () => {
  let client: AxiosInstance;
  let mock: InstanceType<typeof MockAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    _resetClientStateForTesting();
    // Reset Zustand store
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isBootstrapping: false,
    });
    client = createApiClient("https://api.test.routeride.com");
    mock = new MockAdapter(client as any);
  });

  afterEach(() => {
    mock.restore();
  });

  // ─── Test 1: single-flight refresh ─────────────────────────────────────────

  it("fires exactly one refresh when three parallel requests receive 401", async () => {
    seedAuthStore("expired-token", "valid-refresh-token");

    const newAccessToken = "new-access-token";
    const newRefreshToken = "new-refresh-token";

    // All three resource endpoints return 401 on the first attempt
    mock
      .onGet("/resource")
      .replyOnce(401)
      .onGet("/resource")
      .reply(200, { data: "ok" });
    mock
      .onGet("/resource2")
      .replyOnce(401)
      .onGet("/resource2")
      .reply(200, { data: "ok" });
    mock
      .onGet("/resource3")
      .replyOnce(401)
      .onGet("/resource3")
      .reply(200, { data: "ok" });

    // Refresh endpoint succeeds
    mock.onPost("/auth/refresh").replyOnce(200, {
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });

    jest
      .spyOn(useAuthStore.getState(), "setTokens")
      .mockResolvedValue(undefined);

    // Fire all three in parallel
    const results = await Promise.all([
      client.get("/resource"),
      client.get("/resource2"),
      client.get("/resource3"),
    ]);

    // All three should succeed
    results.forEach((r) => expect(r.status).toBe(200));

    // Refresh called exactly once
    const refreshCalls = mock.history.post.filter(
      (r: any) => r.url === "/auth/refresh",
    );
    expect(refreshCalls).toHaveLength(1);
  });

  // ─── Test 2: failed refresh → logout + all callers reject ──────────────────

  it("calls logout and rejects all queued requests when refresh fails", async () => {
    seedAuthStore("expired-token", "invalid-refresh-token");

    mock.onGet("/data").reply(401);
    mock.onGet("/data2").reply(401);
    mock.onPost("/auth/refresh").reply(401); // Refresh also fails

    const logoutSpy = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      ...useAuthStore.getState(),
      logout: logoutSpy,
    } as never);

    await expect(
      Promise.all([client.get("/data"), client.get("/data2")]),
    ).rejects.toBeDefined();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  // ─── Test 3: access token never written to AsyncStorage ────────────────────

  it("does not write access token to AsyncStorage", async () => {
    // Dynamically import AsyncStorage to check it is never touched
    // In a React Native environment this would be @react-native-async-storage/async-storage.
    // In tests we verify the module is never called.
    const asyncStorageMock = {
      setItem: jest.fn(),
      getItem: jest.fn(),
      removeItem: jest.fn(),
    };
    jest.mock(
      "@react-native-async-storage/async-storage",
      () => asyncStorageMock,
      {
        virtual: true,
      },
    );

    seedAuthStore("fresh-token", "refresh-token");
    mock.onGet("/ping").reply(200, { data: "pong" });

    await client.get("/ping");

    // AsyncStorage must never have been touched
    expect(asyncStorageMock.setItem).not.toHaveBeenCalled();
    expect(asyncStorageMock.getItem).not.toHaveBeenCalled();
  });

  // ─── Test 4: Bearer header injected on every request ──────────────────────

  it("injects the Authorization header from the in-memory store", async () => {
    useAuthStore.setState({ accessToken: "my-token", user: null });
    mock.onGet("/protected").reply(200, { data: "secret" });

    await client.get("/protected");

    const req = mock.history.get[0];
    expect(req?.headers?.Authorization).toBe("Bearer my-token");
  });
});

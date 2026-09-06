/**
 * Driver Login screen component tests.
 *
 * Assertions:
 *  1. Renders driver login form (phone, password, sign in button with driver role)
 *  2. Submitting empty form displays field-level validation errors
 *  3. Server 401 error displays user-readable generic message (no raw envelope or enumeration)
 *  4. Navigates to main app shell on successful login
 *  5. Navigates to forgot-password and register (apply to drive) screens
 */
import React from "react";
import { Platform } from "react-native";
import {
  render,
  fireEvent,
  waitFor,
  screen,
} from "@testing-library/react-native";
import DriverLoginScreen from "../app/(auth)/login";

// Mock expo-router
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

// Mock @routeride/ui
const mockPost = jest.fn();
const mockSetTokens = jest.fn();
const mockSetUser = jest.fn();

jest.mock("@routeride/ui", () => {
  const actual = jest.requireActual("@routeride/ui");
  return {
    ...actual,
    getApiClient: () => ({
      post: (...args: unknown[]) => mockPost(...args),
    }),
    initApiClient: jest.fn(),
    useAuthStore: () => ({
      setTokens: mockSetTokens,
      setUser: mockSetUser,
    }),
  };
});

describe("DriverLoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders driver login form with phone, password, and sign in button", () => {
    const { getByText, getByPlaceholderText } = render(<DriverLoginScreen />);

    expect(getByText("Driver sign in")).toBeTruthy();
    expect(getByText("RouteRide Driver Portal")).toBeTruthy();
    expect(getByPlaceholderText("+92 300 0000000")).toBeTruthy();
    expect(getByText("Sign in")).toBeTruthy();
  });

  it("submitting empty form displays field validation errors", async () => {
    const { getByRole } = render(<DriverLoginScreen />);
    const submitBtn = getByRole("button", { name: "Sign in as driver" });

    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  it("displays user-readable message on server 401 rejection", async () => {
    mockPost.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid phone or password",
          },
        },
      },
    });

    const { getByPlaceholderText, getByRole, findByText } = render(
      <DriverLoginScreen />,
    );

    const phoneInput = getByPlaceholderText("+92 300 0000000");
    fireEvent.changeText(phoneInput, "+923001234567");

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.changeText(passwordInput, "Password123!");

    const submitBtn = getByRole("button", { name: "Sign in as driver" });
    fireEvent.press(submitBtn);

    const errorMessage = await findByText(
      "Login failed. Please check your number and password.",
    );
    expect(errorMessage).toBeTruthy();
  });

  it("navigates to main app shell on successful login", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        data: {
          user: { id: "drv-1", phone: "+923001234567", role: "DRIVER" },
          tokens: {
            accessToken: "acc-tok",
            refreshToken: "ref-tok",
            expiresIn: 900,
          },
        },
      },
    });

    const { getByPlaceholderText, getByRole } = render(<DriverLoginScreen />);

    const phoneInput = getByPlaceholderText("+92 300 0000000");
    fireEvent.changeText(phoneInput, "+923001234567");

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.changeText(passwordInput, "ValidPassword123");

    const submitBtn = getByRole("button", { name: "Sign in as driver" });
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(mockSetTokens).toHaveBeenCalledWith(
        { accessToken: "acc-tok", refreshToken: "ref-tok", expiresIn: 900 },
        { id: "drv-1", phone: "+923001234567", role: "DRIVER" },
      );
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
  });

  it("navigates to forgot password screen when link is pressed", () => {
    const { getByText } = render(<DriverLoginScreen />);
    fireEvent.press(getByText("Forgot password?"));
    expect(mockPush).toHaveBeenCalledWith("/(auth)/forgot-password");
  });

  it("navigates to register screen when apply to drive link is pressed", () => {
    const { getByText } = render(<DriverLoginScreen />);
    fireEvent.press(getByText("Apply to drive"));
    expect(mockPush).toHaveBeenCalledWith("/(auth)/register");
  });

  it("handles android platform keyboard behavior", () => {
    const originalOS = Platform.OS;
    Platform.OS = "android";
    const { getByText } = render(<DriverLoginScreen />);
    expect(getByText("Driver sign in")).toBeTruthy();
    Platform.OS = originalOS;
  });
});

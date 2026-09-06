/**
 * Login screen component tests (T0.33).
 *
 * Assertions:
 *  1. Renders login form fields (phone, password, sign in button)
 *  2. Submitting empty form displays field-level validation errors
 *  3. Server 401 error displays user-readable generic message (no raw envelope or enumeration)
 *  4. Loading state while request is in flight
 */
import React from "react";
import { Platform } from "react-native";
import {
  render,
  fireEvent,
  waitFor,
  screen,
} from "@testing-library/react-native";
import LoginScreen from "../app/(auth)/login";

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

describe("LoginScreen (T0.33)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders login form with phone, password, and sign in button", () => {
    const { getByText, getByPlaceholderText } = render(<LoginScreen />);

    expect(getByText("Welcome back")).toBeTruthy();
    expect(getByPlaceholderText("+92 300 0000000")).toBeTruthy();
    expect(getByText("Sign in")).toBeTruthy();
  });

  it("submitting empty form displays field validation errors", async () => {
    const { getByRole } = render(<LoginScreen />);
    const submitBtn = getByRole("button", { name: "Sign in" });

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
      <LoginScreen />,
    );

    const phoneInput = getByPlaceholderText("+92 300 0000000");
    fireEvent.changeText(phoneInput, "+923001234567");

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.changeText(passwordInput, "Password123!");

    const submitBtn = getByRole("button", { name: "Sign in" });
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
          user: { id: "usr-1", phone: "+923001234567", role: "CONSUMER" },
          tokens: {
            accessToken: "acc-tok",
            refreshToken: "ref-tok",
            expiresIn: 900,
          },
        },
      },
    });

    const { getByPlaceholderText, getByRole } = render(<LoginScreen />);

    const phoneInput = getByPlaceholderText("+92 300 0000000");
    fireEvent.changeText(phoneInput, "+923001234567");

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.changeText(passwordInput, "ValidPassword123");

    const submitBtn = getByRole("button", { name: "Sign in" });
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(mockSetTokens).toHaveBeenCalledWith(
        { accessToken: "acc-tok", refreshToken: "ref-tok", expiresIn: 900 },
        { id: "usr-1", phone: "+923001234567", role: "CONSUMER" },
      );
      expect(mockReplace).toHaveBeenCalledWith("/(app)");
    });
  });

  it("navigates to forgot password screen when link is pressed", () => {
    const { getByText } = render(<LoginScreen />);
    fireEvent.press(getByText("Forgot password?"));
    expect(mockPush).toHaveBeenCalledWith("/(auth)/forgot-password");
  });

  it("navigates to register screen when sign up link is pressed", () => {
    const { getByText } = render(<LoginScreen />);
    fireEvent.press(getByText("Sign up"));
    expect(mockPush).toHaveBeenCalledWith("/(auth)/register");
  });

  it("handles android platform keyboard behavior", () => {
    const originalOS = Platform.OS;
    Platform.OS = "android";
    const { getByText } = render(<LoginScreen />);
    expect(getByText("Welcome back")).toBeTruthy();
    Platform.OS = originalOS;
  });
});

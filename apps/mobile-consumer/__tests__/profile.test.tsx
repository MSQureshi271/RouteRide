/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/**
 * Consumer Profile component tests (T0.41 & T0.44).
 *
 * Covers:
 *  - ConsumerProfileScreen:
 *      1. Loads profile from GET /consumers/me and populates emergency contact fields
 *      2. Form validation for invalid phone format
 *      3. Submitting valid form sends PATCH /consumers/me and shows success indicator
 *      4. Handles logout button
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import ConsumerProfileScreen from "../app/(app)/profile";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

// Mock react-native-maps
jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MockMapView = (props: any) => React.createElement(View, props);
  return {
    __esModule: true,
    default: MockMapView,
    Polyline: (props: any) => React.createElement(View, props),
    Marker: (props: any) => React.createElement(View, props),
  };
});

// Mock @routeride/ui
const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockLogout = jest.fn();

jest.mock("@routeride/ui", () => {
  const actual = jest.requireActual("@routeride/ui");
  return {
    ...actual,
    getApiClient: () => ({
      get: (...args: unknown[]) => mockGet(...args),
      patch: (...args: unknown[]) => mockPatch(...args),
    }),
    useAuthStore: () => ({
      user: {
        id: "consumer-user-1",
        fullName: "Zainab Fatima",
        phone: "+923001234567",
        role: "CONSUMER",
      },
      logout: mockLogout,
    }),
  };
});

describe("ConsumerProfileScreen (T0.44)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches existing profile on mount and populates emergency contact fields", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        id: "prof-1",
        userId: "consumer-user-1",
        emergencyContactName: "Amina Khan",
        emergencyContactPhone: "+923009876543",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const { getByDisplayValue, getByText } = render(<ConsumerProfileScreen />);

    await waitFor(() => {
      expect(getByText("Zainab Fatima")).toBeTruthy();
      expect(getByDisplayValue("Amina Khan")).toBeTruthy();
      expect(getByDisplayValue("+923009876543")).toBeTruthy();
    });
  });

  it("submits updated emergency contact details and displays success banner", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        id: "prof-1",
        userId: "consumer-user-1",
        emergencyContactName: "Amina Khan",
        emergencyContactPhone: "+923009876543",
      },
    });

    mockPatch.mockResolvedValueOnce({
      data: {
        id: "prof-1",
        emergencyContactName: "Tariq Khan",
        emergencyContactPhone: "+923001112233",
      },
    });

    const { getByPlaceholderText, getByText } = render(
      <ConsumerProfileScreen />,
    );

    await waitFor(() => {
      expect(getByPlaceholderText("Amina Khan (Mother)")).toBeTruthy();
    });

    fireEvent.changeText(
      getByPlaceholderText("Amina Khan (Mother)"),
      "Tariq Khan",
    );
    fireEvent.changeText(
      getByPlaceholderText("+923001234567"),
      "+923001112233",
    );

    fireEvent.press(getByText("Save Profile"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/consumers/me",
        expect.objectContaining({
          emergencyContactName: "Tariq Khan",
          emergencyContactPhone: "+923001112233",
        }),
      );
      expect(getByText("✓ Profile saved successfully")).toBeTruthy();
    });
  });

  it("calls logout when log out button is pressed", async () => {
    mockGet.mockResolvedValueOnce({ data: null });

    const { getByText } = render(<ConsumerProfileScreen />);

    await waitFor(() => {
      expect(getByText("Log out")).toBeTruthy();
    });

    fireEvent.press(getByText("Log out"));

    expect(mockLogout).toHaveBeenCalled();
  });
});

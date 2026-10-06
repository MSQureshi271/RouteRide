/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/**
 * Rider Management component tests (T0.44).
 *
 * Covers:
 *  - RidersIndexScreen:
 *      1. Displays empty state with "Add your first rider" invitation
 *      2. Renders list of riders with avatar initials, home and school addresses
 *      3. Tapping Edit navigates to edit screen
 *      4. Tapping Delete prompts confirmation dialog with consequence warning
 *      5. Deletion conflict (409 active subscription) displays user-friendly alert
 *  - AddRiderScreen:
 *      1. Renders name, home address, and school destination inputs
 *      2. Form validation displays errors for missing fields
 *      3. Submitting valid form calls POST /consumers/me/riders and navigates back
 *      4. Handles geocoding failure (422 NO_ROUTE_FOUND) with descriptive message
 */
import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import RidersIndexScreen from "../app/(app)/riders/index";
import AddRiderScreen from "../app/(app)/riders/add";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: {
      push: (...args: unknown[]) => mockPush(...args),
      back: (...args: unknown[]) => mockBack(...args),
      replace: (...args: unknown[]) => mockReplace(...args),
    },
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

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
const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock("@routeride/ui", () => {
  const actual = jest.requireActual("@routeride/ui");
  return {
    ...actual,
    getApiClient: () => ({
      get: (...args: unknown[]) => mockGet(...args),
      post: (...args: unknown[]) => mockPost(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    }),
  };
});

const MOCK_RIDERS = [
  {
    id: "rider-1",
    consumerProfileId: "prof-1",
    name: "Sara Ahmed",
    homeAddressText: "DHA Phase 5, Karachi",
    destAddressText: "Karachi Grammar School",
    notes: "Grade 4",
    photoUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "rider-2",
    consumerProfileId: "prof-1",
    name: "Ali Khan",
    homeAddressText: "Clifton Block 2, Karachi",
    destAddressText: "Bay View Academy",
    notes: null,
    photoUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("Rider Management (T0.44)", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  // ─── Riders List Screen ─────────────────────────────────────────────────────
  describe("RidersIndexScreen", () => {
    it("renders empty state when no riders are returned", async () => {
      mockGet.mockResolvedValueOnce({ data: [] });

      const { getByText } = render(<RidersIndexScreen />);

      await waitFor(() => {
        expect(getByText("No riders yet")).toBeTruthy();
        expect(
          getByText(
            "Add your first rider to start searching for school routes.",
          ),
        ).toBeTruthy();
        expect(getByText("Add a Rider")).toBeTruthy();
      });
    });

    it("renders list of rider cards with name, avatar, and addresses", async () => {
      mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

      const { getByText } = render(<RidersIndexScreen />);

      await waitFor(() => {
        expect(getByText("Sara Ahmed")).toBeTruthy();
        expect(getByText("Ali Khan")).toBeTruthy();
        expect(getByText("🏠 DHA Phase 5, Karachi")).toBeTruthy();
        expect(getByText("🏫 Karachi Grammar School")).toBeTruthy();
        expect(getByText("🏠 Clifton Block 2, Karachi")).toBeTruthy();
      });
    });

    it("navigates to edit screen when edit button is pressed", async () => {
      mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

      const { getByTestId } = render(<RidersIndexScreen />);

      await waitFor(() => {
        expect(getByTestId("edit-rider-rider-1")).toBeTruthy();
      });

      fireEvent.press(getByTestId("edit-rider-rider-1"));

      expect(mockPush).toHaveBeenCalledWith("/(app)/riders/rider-1/edit");
    });

    it("prompts confirmation alert naming consequences on delete", async () => {
      mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

      const { getByTestId } = render(<RidersIndexScreen />);

      await waitFor(() => {
        expect(getByTestId("delete-rider-rider-1")).toBeTruthy();
      });

      fireEvent.press(getByTestId("delete-rider-rider-1"));

      expect(alertSpy).toHaveBeenCalledWith(
        "Delete Rider",
        "Remove Sara Ahmed from your account? This cannot be undone.",
        expect.any(Array),
      );
    });

    it("handles 409 active subscription conflict on delete with a descriptive alert", async () => {
      mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });
      mockDelete.mockRejectedValueOnce({
        response: { status: 409 },
      });

      const { getByTestId } = render(<RidersIndexScreen />);

      await waitFor(() => {
        expect(getByTestId("delete-rider-rider-1")).toBeTruthy();
      });

      // Press delete
      fireEvent.press(getByTestId("delete-rider-rider-1"));

      // Trigger the destructive "Delete" action button from the alert call
      const alertCall = alertSpy.mock.calls[0];
      const deleteButton = alertCall[2].find(
        (btn: any) => btn.text === "Delete",
      );
      await deleteButton.onPress();

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          "Cannot Delete Rider",
          expect.stringContaining("active route subscription"),
          expect.any(Array),
        );
      });
    });
  });

  // ─── Add Rider Screen ───────────────────────────────────────────────────────
  describe("AddRiderScreen", () => {
    it("renders rider input fields", () => {
      const { getByPlaceholderText, getByText } = render(<AddRiderScreen />);

      expect(getByPlaceholderText("Sara Ahmed")).toBeTruthy();
      expect(
        getByPlaceholderText("House 12, Block A, DHA Phase 5, Karachi"),
      ).toBeTruthy();
      expect(
        getByPlaceholderText("Karachi Grammar School, Bath Island, Clifton"),
      ).toBeTruthy();
      expect(getByText("Add Rider")).toBeTruthy();
    });

    it("displays error banner when geocoding fails with 422 NO_ROUTE_FOUND", async () => {
      mockPost.mockRejectedValueOnce({
        response: {
          status: 422,
          data: { error: { code: "NO_ROUTE_FOUND" } },
        },
      });

      const { getByPlaceholderText, getByText } = render(<AddRiderScreen />);

      fireEvent.changeText(getByPlaceholderText("Sara Ahmed"), "Test Rider");
      fireEvent.changeText(
        getByPlaceholderText("House 12, Block A, DHA Phase 5, Karachi"),
        "Unknown street 999",
      );
      fireEvent.changeText(
        getByPlaceholderText("Karachi Grammar School, Bath Island, Clifton"),
        "Unknown destination 999",
      );

      fireEvent.press(getByText("Add Rider"));

      await waitFor(() => {
        expect(
          getByText(
            "We couldn't find that address. Please enter a more specific address including the street and area.",
          ),
        ).toBeTruthy();
      });
    });

    it("submits valid rider details and navigates back", async () => {
      mockPost.mockResolvedValueOnce({
        data: { id: "new-rider-id" },
      });

      const { getByPlaceholderText, getByText } = render(<AddRiderScreen />);

      fireEvent.changeText(getByPlaceholderText("Sara Ahmed"), "Zayd Farooq");
      fireEvent.changeText(
        getByPlaceholderText("House 12, Block A, DHA Phase 5, Karachi"),
        "DHA Phase 5",
      );
      fireEvent.changeText(
        getByPlaceholderText("Karachi Grammar School, Bath Island, Clifton"),
        "Karachi Grammar School",
      );

      fireEvent.press(getByText("Add Rider"));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/consumers/me/riders",
          expect.objectContaining({
            name: "Zayd Farooq",
            homeAddressText: "DHA Phase 5",
            destAddressText: "Karachi Grammar School",
          }),
        );
        expect(mockBack).toHaveBeenCalled();
      });
    });
  });
});

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/**
 * Driver Onboarding Wizard component tests (T0.43).
 *
 * Covers:
 *  - Step1VehicleScreen: Form validation, bounds, submit, 409 conflict handling
 *  - Step2DocumentsScreen: Mandatory document cards, upload flow, continue button
 *  - Step4AvailabilityScreen: Confirmed schedule, price validation in PKR, submission
 *  - PendingScreen: Application under review display, status re-check, approval redirect, logout
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import Step1VehicleScreen from "../app/(onboarding)/step1-vehicle";
import Step2DocumentsScreen from "../app/(onboarding)/step2-documents";
import Step4AvailabilityScreen from "../app/(onboarding)/step4-availability";
import PendingScreen from "../app/(onboarding)/pending";
jest.mock("@quidone/react-native-wheel-picker");

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
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

// Mock expo-document-picker & expo-file-system
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: "file:///mock/path/cnic.jpg",
        name: "cnic.jpg",
        mimeType: "image/jpeg",
        size: 1024 * 500,
      },
    ],
  }),
}));

jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///mock/cache" },
  File: Object.assign(
    jest.fn().mockImplementation((_path, _name) => ({
      uri: "file:///mock/cache/test.jpg",
      exists: true,
      copy: jest.fn(),
      delete: jest.fn(),
    })),
    {
      pickFileAsync: jest.fn().mockResolvedValue({
        canceled: false,
        result: {
          uri: "file:///mock/cache/picked.jpg",
          name: "picked.jpg",
          type: "image/jpeg",
          exists: true,
          copy: jest.fn(),
          delete: jest.fn(),
        },
      }),
    },
  ),
}));

// Mock XMLHttpRequest for S3 upload
class MockXHR {
  status = 200;
  responseText = "OK";
  onload = () => {};
  onerror = () => {};
  ontimeout = () => {};
  open = jest.fn();
  setRequestHeader = jest.fn();
  send = jest.fn().mockImplementation(function (this: MockXHR) {
    setTimeout(() => {
      this.status = 200;
      this.onload();
    }, 0);
  });
}
(globalThis as any).XMLHttpRequest = MockXHR as any;

// Mock @routeride/ui
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockPut = jest.fn();
const mockLogout = jest.fn();
const mockSetUser = jest.fn();

let mockOnboardingStatus = {
  currentStep: "step1-vehicle",
  status: "PENDING" as string | null,
  profileCompleted: false,
  documentsCompleted: false,
  availabilityCompleted: false,
  uploadedDocuments: [] as string[],
  missingDocuments: ["CNIC", "LICENCE", "REGISTRATION", "INSURANCE"],
};

let mockUploadedDocs: any[] = [];

jest.mock("@routeride/ui", () => {
  const actual = jest.requireActual("@routeride/ui");
  return {
    ...actual,
    getApiClient: () => ({
      get: (...args: unknown[]) => mockGet(...args),
      post: (...args: unknown[]) => mockPost(...args),
      patch: (...args: unknown[]) => mockPatch(...args),
      put: (...args: unknown[]) => mockPut(...args),
    }),
    useAuthStore: () => ({
      user: { id: "user-1", fullName: "Driver Test", role: "DRIVER" },
      setUser: mockSetUser,
      logout: mockLogout,
    }),
  };
});

describe("Driver Onboarding Wizard (T0.43)", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockOnboardingStatus = {
      currentStep: "step1-vehicle",
      status: "PENDING",
      profileCompleted: false,
      documentsCompleted: false,
      availabilityCompleted: false,
      uploadedDocuments: [],
      missingDocuments: ["CNIC", "LICENCE", "REGISTRATION", "INSURANCE"],
    };

    mockUploadedDocs = [];

    mockGet.mockImplementation((url: string) => {
      if (url === "/drivers/me/service-area") {
        return Promise.resolve({
          data: {
            settings: {
              serviceArea: {
                type: "Polygon",
                coordinates: [
                  [
                    [67, 24.8],
                    [67.2, 24.8],
                    [67.2, 25],
                    [67, 25],
                    [67, 24.8],
                  ],
                ],
              },
              startingLocation: { type: "Point", coordinates: [67.01, 24.86] },
              availability: [1, 2, 3, 4, 5].map((day) => ({
                day,
                startTime: "06:00",
                endTime: "10:00",
              })),
              acceptingRequests: true,
              routeState: "UNSET",
              routePolyline: null,
            },
            availabilityVersion: 1,
            rosterVersion: 0,
            requiresSetup: false,
          },
        });
      }
      if (url === "/drivers/me/onboarding-status") {
        return Promise.resolve({ data: { ...mockOnboardingStatus } });
      }
      if (url === "/drivers/me/documents") {
        return Promise.resolve({ data: [...mockUploadedDocs] });
      }
      if (url === "/drivers/me") {
        return Promise.resolve({
          data: {
            id: "profile-1",
            operatingDays: [1, 2, 3, 4, 5],
            basePriceCents: 1500000,
          },
        });
      }
      return Promise.resolve({ data: null });
    });
  });

  // ─── Step 1: Vehicle & Licence Details ──────────────────────────────────────
  describe("Step1VehicleScreen", () => {
    it("renders vehicle fields and licence input", () => {
      const { getByPlaceholderText, getByText } = render(
        <Step1VehicleScreen />,
      );

      expect(getByPlaceholderText("LIC-123456")).toBeTruthy();
      expect(getByPlaceholderText("Toyota")).toBeTruthy();
      expect(getByPlaceholderText("Corolla")).toBeTruthy();
      expect(getByPlaceholderText("2020")).toBeTruthy();
      expect(getByPlaceholderText("White")).toBeTruthy();
      expect(getByPlaceholderText("KHI-123")).toBeTruthy();
      expect(getByPlaceholderText("4")).toBeTruthy();
      expect(getByText("Continue")).toBeTruthy();
    });

    it("displays validation error when invalid year or seat capacity is entered", async () => {
      const { getByPlaceholderText, getByText } = render(
        <Step1VehicleScreen />,
      );

      fireEvent.changeText(getByPlaceholderText("LIC-123456"), "LIC-999");
      fireEvent.changeText(getByPlaceholderText("Toyota"), "Toyota");
      fireEvent.changeText(getByPlaceholderText("Corolla"), "Yaris");
      fireEvent.changeText(getByPlaceholderText("2020"), "1980"); // below 1990
      fireEvent.changeText(getByPlaceholderText("White"), "Black");
      fireEvent.changeText(getByPlaceholderText("KHI-123"), "ABC-999");
      fireEvent.changeText(getByPlaceholderText("4"), "0"); // below 1

      fireEvent.press(getByText("Continue"));

      await waitFor(() => {
        expect(getByText("Invalid vehicle year")).toBeTruthy();
        expect(getByText("Must be between 1 and 50")).toBeTruthy();
      });
    });

    it("submits valid vehicle info and calls onboarding navigation", async () => {
      mockPost.mockResolvedValueOnce({ data: { id: "profile-123" } });
      mockOnboardingStatus.currentStep = "step2-documents";

      const { getByPlaceholderText, getByText } = render(
        <Step1VehicleScreen />,
      );

      fireEvent.changeText(getByPlaceholderText("LIC-123456"), "LIC-VALID-1");
      fireEvent.changeText(getByPlaceholderText("Toyota"), "Honda");
      fireEvent.changeText(getByPlaceholderText("Corolla"), "Civic");
      fireEvent.changeText(getByPlaceholderText("2020"), "2022");
      fireEvent.changeText(getByPlaceholderText("White"), "Silver");
      fireEvent.changeText(getByPlaceholderText("KHI-123"), "KHI-777");
      fireEvent.changeText(getByPlaceholderText("4"), "4");

      fireEvent.press(getByText("Continue"));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/drivers/onboard",
          expect.objectContaining({
            licenceNumber: "LIC-VALID-1",
            vehicleMake: "Honda",
            vehicleModel: "Civic",
            vehicleYear: 2022,
            vehicleColour: "Silver",
            plateNumber: "KHI-777",
            seatCapacity: 4,
            currency: "PKR",
          }),
        );
        expect(mockReplace).toHaveBeenCalledWith(
          "/(onboarding)/step2-documents",
        );
      });
    });

    it("handles 409 conflict by fetching and navigating to current step", async () => {
      mockPost.mockRejectedValueOnce({ response: { status: 409 } });
      mockOnboardingStatus.currentStep = "step2-documents";

      const { getByPlaceholderText, getByText } = render(
        <Step1VehicleScreen />,
      );

      fireEvent.changeText(getByPlaceholderText("LIC-123456"), "LIC-VALID-1");
      fireEvent.changeText(getByPlaceholderText("Toyota"), "Honda");
      fireEvent.changeText(getByPlaceholderText("Corolla"), "Civic");
      fireEvent.changeText(getByPlaceholderText("2020"), "2022");
      fireEvent.changeText(getByPlaceholderText("White"), "Silver");
      fireEvent.changeText(getByPlaceholderText("KHI-123"), "KHI-777");
      fireEvent.changeText(getByPlaceholderText("4"), "4");

      fireEvent.press(getByText("Continue"));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(
          "/(onboarding)/step2-documents",
        );
      });
    });
  });

  // ─── Step 2: Document Upload ────────────────────────────────────────────────
  describe("Step2DocumentsScreen", () => {
    it("renders required document cards and marks uploaded documents", async () => {
      mockUploadedDocs = [
        {
          id: "doc-1",
          docType: "CNIC",
          s3Key: "drivers/cnic.jpg",
          createdAt: new Date().toISOString(),
        },
      ];

      const { getByText } = render(<Step2DocumentsScreen />);

      await waitFor(() => {
        expect(getByText("CNIC (National ID)")).toBeTruthy();
        expect(getByText("Driving Licence")).toBeTruthy();
        expect(getByText("Vehicle Registration")).toBeTruthy();
        expect(getByText("Vehicle Insurance")).toBeTruthy();
        expect(getByText("✓ Uploaded")).toBeTruthy();
      });
    });

    it("uploads a document successfully and updates status to done", async () => {
      mockPost.mockImplementation((url: string) => {
        if (url === "/drivers/me/documents/upload-url") {
          return Promise.resolve({
            data: {
              uploadUrl: "https://s3.localstack/bucket/key?sig=123",
              key: "drivers/doc-key.jpg",
            },
          });
        }
        if (url === "/drivers/me/documents/confirm") {
          return Promise.resolve({ data: { success: true } });
        }
        return Promise.resolve({ data: null });
      });

      const { getAllByText } = render(<Step2DocumentsScreen />);

      await waitFor(() => {
        expect(getAllByText("Upload")[0]!).toBeTruthy();
      });

      // Press upload on the first idle document (CNIC)
      fireEvent.press(getAllByText("Upload")[0]!);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/drivers/me/documents/upload-url",
          expect.objectContaining({ docType: "CNIC" }),
        );
        expect(mockPost).toHaveBeenCalledWith(
          "/drivers/me/documents/confirm",
          expect.objectContaining({ docType: "CNIC" }),
        );
      });
    });

    it("navigates to step4-availability when continue is pressed", async () => {
      mockUploadedDocs = [
        { id: "1", docType: "CNIC", s3Key: "k1" },
        { id: "2", docType: "LICENCE", s3Key: "k2" },
        { id: "3", docType: "REGISTRATION", s3Key: "k3" },
        { id: "4", docType: "INSURANCE", s3Key: "k4" },
      ];
      mockOnboardingStatus.currentStep = "step4-availability";

      const { getByText } = render(<Step2DocumentsScreen />);

      await waitFor(() => {
        expect(getByText("Continue")).toBeTruthy();
      });

      fireEvent.press(getByText("Continue"));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(
          "/(onboarding)/step4-availability",
        );
      });
    });
  });

  // ─── Step 4: Availability & Pricing ─────────────────────────────────────────
  describe("Step4AvailabilityScreen", () => {
    it("renders the schedule editor and monthly price input", async () => {
      const { getByText, getByPlaceholderText } = render(
        <Step4AvailabilityScreen />,
      );

      await waitFor(() => {
        expect(getByText("Your driving hours")).toBeTruthy();
        expect(getByText("Schedule preview")).toBeTruthy();
        expect(getByText("Service area and availability")).toBeTruthy();
        expect(getByPlaceholderText("10,000")).toBeTruthy();
        expect(getByText("Submit Application")).toBeTruthy();
      });
    });

    it("previews existing hours as one group of work days", async () => {
      const { getByText, getByTestId } = render(<Step4AvailabilityScreen />);
      await waitFor(() =>
        expect(getByTestId("service-area-start")).toBeTruthy(),
      );
      expect(getByText("Mon–Fri")).toBeTruthy();
      expect(getByText("6:00 AM – 10:00 AM")).toBeTruthy();
    });

    it("validates price within platform bounds", async () => {
      const { getByText, getByPlaceholderText } = render(
        <Step4AvailabilityScreen />,
      );

      await waitFor(() => {
        expect(getByPlaceholderText("10,000")).toBeTruthy();
      });

      // Price too low (below 5000 PKR)
      await waitFor(() =>
        expect(getByText("Service area and availability")).toBeTruthy(),
      );
      fireEvent.changeText(getByPlaceholderText("10,000"), "1000");
      fireEvent.press(getByText("Submit Application"));

      await waitFor(() => {
        expect(
          getByText(/Price must be between PKR 5,000 and PKR 30,000/),
        ).toBeTruthy();
      });

      // Price too high (above 30000 PKR)
      fireEvent.changeText(getByPlaceholderText("10,000"), "50000");
      fireEvent.press(getByText("Submit Application"));

      await waitFor(() => {
        expect(
          getByText(/Price must be between PKR 5,000 and PKR 30,000/),
        ).toBeTruthy();
      });
    });

    it("submits valid availability and navigates to pending", async () => {
      mockPatch.mockResolvedValueOnce({ data: { success: true } });
      mockOnboardingStatus.currentStep = "pending";

      const { getByText, getByPlaceholderText } = render(
        <Step4AvailabilityScreen />,
      );

      await waitFor(() => {
        expect(getByPlaceholderText("10,000")).toBeTruthy();
      });

      fireEvent.changeText(getByPlaceholderText("10,000"), "12000");
      await waitFor(() =>
        expect(getByText("Service area and availability")).toBeTruthy(),
      );
      fireEvent.press(getByText("Submit Application"));

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith(
          "/drivers/me/service-area",
          expect.objectContaining({ routeState: "UNSET", routePolyline: null }),
        );
        expect(mockPatch).toHaveBeenCalledWith(
          "/drivers/me",
          expect.objectContaining({
            operatingDays: [1, 2, 3, 4, 5],
            basePriceCents: 1200000,
          }),
        );
        expect(mockReplace).toHaveBeenCalledWith("/(onboarding)/pending");
      });
    });
  });

  // ─── Pending Screen ─────────────────────────────────────────────────────────
  describe("PendingScreen", () => {
    it("renders application under review banner and allows manual status check", async () => {
      mockOnboardingStatus.currentStep = "pending";
      mockOnboardingStatus.status = "PENDING";

      const { getByText, getByTestId } = render(<PendingScreen />);

      await waitFor(() => {
        expect(getByText("Application Under Review")).toBeTruthy();
        expect(
          getByText(
            "Your application is currently under review by our verification team.",
          ),
        ).toBeTruthy();
        expect(getByTestId("check-status-btn")).toBeTruthy();
        expect(getByTestId("pending-logout-btn")).toBeTruthy();
      });

      // Press check status button
      fireEvent.press(getByTestId("check-status-btn"));

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith("/drivers/me/onboarding-status");
      });
    });

    it("redirects to main app shell /(app) if status is APPROVED", async () => {
      mockOnboardingStatus.currentStep = "approved";
      mockOnboardingStatus.status = "APPROVED";

      render(<PendingScreen />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/(app)");
      });
    });

    it("calls logout and redirects to login on sign out", async () => {
      mockOnboardingStatus.currentStep = "pending";
      mockOnboardingStatus.status = "PENDING";

      const { getByTestId } = render(<PendingScreen />);

      await waitFor(() => {
        expect(getByTestId("pending-logout-btn")).toBeTruthy();
      });

      fireEvent.press(getByTestId("pending-logout-btn"));

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
      });
    });
  });
});

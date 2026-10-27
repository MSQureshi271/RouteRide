import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import DriverProfileScreen from "../app/(app)/drivers/[id]";

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: "MapView",
  Polyline: "Polyline",
  Marker: "Marker",
}));

const mockGet = jest.fn();
const mockBack = jest.fn();
const mockParams: Record<string, string> = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  riderId: "550e8400-e29b-41d4-a716-446655440002",
  day: "1",
  departureTime: "07:30",
  subscriptionType: "ONE_WAY",
  riderName: "Selected child",
};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@routeride/ui", () => ({
  ...jest.requireActual("@routeride/ui"),
  getApiClient: () => ({ get: mockGet }),
}));
const profile = {
  driver: {
    driverProfileId: mockParams["id"],
    driverName: "Example Driver",
    vehicleMake: "Toyota",
    vehicleModel: "HiAce",
    vehicleColour: "White",
    monthlyPriceCents: 1500000,
    currency: "PKR",
    routeState: "UNSET",
    pickupDistanceMeters: null,
    destDistanceMeters: null,
    availableSeats: 3,
    availabilityStatus: "AVAILABLE",
    reviewStatus: "REQUIRED",
    avgRating: 5,
    reviewCount: 11,
  },
  photoUrl: null,
  vehicleYear: 2020,
  plateNumber: "ABC-123",
  verificationTier: "BASIC",
  ratingDistribution: [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: rating === 5 ? 11 : 0,
  })),
  reviews: [
    {
      rating: 5,
      comment: "Reliable",
      createdAt: "2026-10-01T12:00:00Z",
      verified: true,
    },
  ],
  reviewsPagination: { page: 1, pageSize: 10, total: 11, hasMore: true },
};
const response = (data: unknown = profile) => ({ data: { data } });
describe("Public driver profile screen", () => {
  beforeEach(() => jest.clearAllMocks());
  it("retains the commute, explains verification and honestly disables the upcoming send flow", async () => {
    mockGet.mockResolvedValue(response());
    const screen = render(<DriverProfileScreen />);
    expect(screen.getByText("Loading driver profile...")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("Example Driver")).toBeTruthy(),
    );
    expect(screen.getByText("Selected child · Monday")).toBeTruthy();
    expect(screen.getByText("No established route")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Send request" }).props[
        "accessibilityState"
      ],
    ).toEqual({ disabled: true });
    expect(screen.getByText(/No request has been sent/)).toBeTruthy();
    fireEvent.press(screen.getByText("BASIC verification · What was checked?"));
    expect(
      screen.getByText(
        /identity, driving licence and vehicle documents checked/,
      ),
    ).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(
      `/drivers/${mockParams["id"]}/public-profile`,
      {
        params: expect.objectContaining({
          riderId: mockParams["riderId"],
          departureTime: "07:30",
          reviewsPage: "1",
        }),
      },
    );
  });
  it("paginates verified reviews using the same commute", async () => {
    mockGet.mockResolvedValueOnce(response()).mockResolvedValueOnce(
      response({
        ...profile,
        reviews: [],
        reviewsPagination: {
          page: 2,
          pageSize: 10,
          total: 11,
          hasMore: false,
        },
      }),
    );
    const screen = render(<DriverProfileScreen />);
    await waitFor(() => expect(screen.getByText("Next reviews")).toBeTruthy());
    fireEvent.press(screen.getByText("Next reviews"));
    await waitFor(() =>
      expect(screen.getByText("Previous reviews")).toBeTruthy(),
    );
    expect(mockGet).toHaveBeenLastCalledWith(expect.any(String), {
      params: expect.objectContaining({ reviewsPage: "2", departureTime: "07:30" }),
    });
  });
  it("handles changed availability and retries without showing a send action", async () => {
    mockGet
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(
        response({
          ...profile,
          driver: { ...profile.driver, avgRating: null, reviewCount: 0 },
          reviews: [],
          ratingDistribution: profile.ratingDistribution.map((bin) => ({
            ...bin,
            count: 0,
          })),
          reviewsPagination: {
            page: 1,
            pageSize: 10,
            total: 0,
            hasMore: false,
          },
        }),
      );
    const screen = render(<DriverProfileScreen />);
    await waitFor(() => expect(screen.getByText("Retry profile")).toBeTruthy());
    expect(screen.queryByText("Send request")).toBeNull();
    fireEvent.press(screen.getByText("Retry profile"));
    await waitFor(() =>
      expect(screen.getByText("New driver · No reviews yet")).toBeTruthy(),
    );
  });
});

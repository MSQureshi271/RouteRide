import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import SearchResultsScreen from "../app/(app)/search/results";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
const mockGet = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => ({
    riderId: "550e8400-e29b-41d4-a716-446655440000",
    day: "1",
    departureTime: "07:30",
    subscriptionType: "ONE_WAY",
    riderName: "Example Rider",
  }),
}));
jest.mock("@routeride/ui", () => ({
  ...jest.requireActual("@routeride/ui"),
  getApiClient: () => ({ get: mockGet }),
}));
jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: "MapView",
  Polyline: "Polyline",
  Marker: "Marker",
}));
const candidate = {
  driverProfileId: "550e8400-e29b-41d4-a716-446655440001",
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
  avgRating: null,
  reviewCount: 0,
};
const response = (results: unknown[], page = 1, total = 1) => ({
  data: {
    data: {
      version: "v2",
      results,
      pagination: { page, pageSize: 20, total, hasMore: page * 20 < total },
    },
  },
});
describe("Service-area driver results", () => {
  beforeEach(() => jest.clearAllMocks());
  it("honestly labels a route-free driver and retains commute context during review", async () => {
    mockGet.mockResolvedValue(response([candidate]));
    const screen = render(<SearchResultsScreen />);
    await waitFor(() =>
      expect(screen.getByText("No established route")).toBeTruthy(),
    );
    expect(screen.queryByText(/walk/)).toBeNull();
    expect(screen.getByText("New driver")).toBeTruthy();
    fireEvent.press(screen.getByText("Review driver"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(app)/drivers/[id]",
      params: expect.objectContaining({
        id: candidate.driverProfileId,
        riderId: "550e8400-e29b-41d4-a716-446655440000",
        departureTime: "07:30",
      }),
    });
  });
  it("browses lower-ranked drivers and uses geographic route estimates", async () => {
    mockGet
      .mockResolvedValueOnce(response([candidate], 1, 21))
      .mockResolvedValueOnce(
        response(
          [
            {
              ...candidate,
              driverName: "Further Driver",
              routeState: "ESTABLISHED",
              pickupDistanceMeters: 3400,
              destDistanceMeters: 5100,
            },
          ],
          2,
          21,
        ),
      );
    const screen = render(<SearchResultsScreen />);
    await waitFor(() => expect(screen.getByText("Next drivers")).toBeTruthy());
    fireEvent.press(screen.getByText("Next drivers"));
    await waitFor(() =>
      expect(screen.getByText("Further Driver")).toBeTruthy(),
    );
    expect(mockGet).toHaveBeenLastCalledWith("/drivers/search", {
      params: expect.objectContaining({ page: "2", pageSize: "20" }),
    });
    expect(screen.getByText("3400m to route")).toBeTruthy();
    expect(screen.queryByText("Next drivers")).toBeNull();
    expect(screen.getByText("Previous drivers")).toBeTruthy();
  });
  it("renders empty and retryable error states", async () => {
    mockGet
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response([], 1, 0));
    const screen = render(<SearchResultsScreen />);
    await waitFor(() => expect(screen.getByText("Retry search")).toBeTruthy());
    fireEvent.press(screen.getByText("Retry search"));
    await waitFor(() =>
      expect(screen.getByText("No Drivers Available")).toBeTruthy(),
    );
  });
});

describe("Driver card presentation", () => {
  beforeEach(() => jest.clearAllMocks());
  it("shows the offered commute, rated drivers, and fractional paisa prices in server order", async () => {
    mockGet.mockResolvedValue(
      response(
        [
          {
            ...candidate,
            driverName: "First Driver",
            monthlyPriceCents: 1650050,
            avgRating: 4.8,
            reviewCount: 12,
          },
          {
            ...candidate,
            driverProfileId: "550e8400-e29b-41d4-a716-446655440002",
            driverName: "Second Driver",
          },
        ],
        1,
        2,
      ),
    );
    const screen = render(<SearchResultsScreen />);
    await waitFor(() =>
      expect(screen.getByText("PKR 16,500.50 / month")).toBeTruthy(),
    );
    expect(screen.getAllByText("Available Monday at 07:30")).toHaveLength(2);
    expect(screen.getByText("4.8 (12 reviews)")).toBeTruthy();
    expect(
      screen
        .getAllByRole("button", { name: /Review .*Driver/ })
        .map((node) => node.props["accessibilityLabel"]),
    ).toEqual(["Review First Driver", "Review Second Driver"]);
  });
  it("shows loading until the request resolves", async () => {
    let finish: (value: ReturnType<typeof response>) => void = () => {};
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const screen = render(<SearchResultsScreen />);
    expect(
      screen.getByText("Finding available drivers for your commute..."),
    ).toBeTruthy();
    await act(async () => {
      finish(response([], 1, 0));
    });
    await waitFor(() =>
      expect(screen.getByText("No Drivers Available")).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByRole("button", { name: "Adjust Schedule or Time" }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

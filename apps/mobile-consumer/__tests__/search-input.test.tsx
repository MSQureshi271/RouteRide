/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/**
 * Search Input Screen Component & Unit Tests (Task 1.11 Redesign).
 *
 * Verifies:
 *  1. Renders shimmering skeleton while fetching riders
 *  2. Displays empty state when consumer has 0 riders with "Add a Rider" CTA
 *  3. Auto-selects first rider and renders RoutePreviewCard with pickup/dest addresses
 *  4. Switching rider via RiderDropdown updates selected rider and corridor card addresses
 *  5. Trip type pill toggle dynamically hides/shows Departure Time row (One-Way vs. Round Trip)
 *  6. Operating day presets (Work, Weekend, Custom) and circular day chip toggles
 *  7. Interactive TimePickerModal opens, updates time, and confirms formatted value
 *  8. Form submission maps correctly to @routeride/contracts and navigates to results
 *  9. One-Way form submission maps to subscriptionType: 'ONE_WAY'
 *  10. Back button navigates back
 *  11. Two-tier schema validation and contract transformation unit tests
 *  12. Time conversion utilities (to12Hour, to24Hour, formatTimeDisplay)
 */
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

import SearchInputScreen, {
  SearchInputFormStateSchema,
  buildDriverSearchQuery,
} from "../app/(app)/search/index";
import {
  to12Hour,
  to24Hour,
  formatTimeDisplay,
} from "../src/components/search/timeUtils";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({
      push: (...args: unknown[]) => mockPush(...args),
      back: (...args: unknown[]) => mockBack(...args),
    }),
    router: {
      push: (...args: unknown[]) => mockPush(...args),
      back: (...args: unknown[]) => mockBack(...args),
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

jest.mock(
  "@quidone/react-native-wheel-picker",
  () => {
    const React = require("react");
    const { Pressable, Text, View } = require("react-native");
    return function MockWheel({ data, value, testID, onValueChanged }: any) {
      const [position, setPosition] = React.useState(value);
      return (
        <View testID={testID}>
          {data.map((item: any, index: number) => (
            <Pressable
              key={String(item.value)}
              accessibilityLabel={`${testID === "wheel-hour" ? "Hour" : testID === "wheel-minute" ? "Minute" : "Period"} ${item.label}`}
              accessibilityState={{ selected: position === item.value }}
              onPress={() => {
                setPosition(item.value);
                onValueChanged({ item, index });
              }}
            >
              <Text>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      );
    };
  },
  { virtual: true },
);

// Mock @routeride/ui API client
const mockGet = jest.fn();

jest.mock("@routeride/ui", () => {
  const actual = jest.requireActual("@routeride/ui");
  return {
    ...actual,
    getApiClient: () => ({
      get: (...args: unknown[]) => mockGet(...args),
    }),
  };
});

const RIDER_1_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_2_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "33333333-3333-4333-8333-333333333333";

const MOCK_RIDERS = [
  {
    id: RIDER_1_ID,
    consumerProfileId: PROFILE_ID,
    name: "Sara Ahmed",
    homeAddressText: "DHA Phase 5, Karachi",
    destAddressText: "Karachi Grammar School",
    notes: "Grade 4",
    photoUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: RIDER_2_ID,
    consumerProfileId: PROFILE_ID,
    name: "Ali Khan",
    homeAddressText: "Clifton Block 2, Karachi",
    destAddressText: "Bay View Academy",
    notes: null,
    photoUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("SearchInputScreen (T1.11 Redesign)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── 1. Loading State ───────────────────────────────────────────────────────
  it("renders shimmering skeleton while loading riders", async () => {
    let resolvePromise!: (val: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockGet.mockReturnValueOnce(pendingPromise);

    const { getByTestId } = render(<SearchInputScreen />);
    expect(getByTestId("search-input-skeleton")).toBeTruthy();

    await act(async () => {
      resolvePromise({ data: [] });
    });
  });

  // ─── 2. Empty State ─────────────────────────────────────────────────────────
  it("renders empty state when consumer has no riders", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });

    const { getByText } = render(<SearchInputScreen />);

    await waitFor(() => {
      expect(getByText("No Passengers Registered")).toBeTruthy();
      expect(
        getByText(
          "Add your child or rider profile first with home pickup and destination addresses.",
        ),
      ).toBeTruthy();
    });

    const addBtn = getByText("Add a Rider");
    fireEvent.press(addBtn);
    expect(mockPush).toHaveBeenCalledWith("/(app)/riders/add");
  });

  // ─── 3. Prefill Defaults & Route Preview Card ───────────────────────────────
  it("auto-selects first rider and renders route preview card with addresses", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

    const { getByText, getByTestId } = render(<SearchInputScreen />);

    await waitFor(() => {
      expect(getByText("Sara Ahmed")).toBeTruthy();
    });

    // Route Preview card shows Sara's addresses
    expect(getByTestId("route-preview-pickup").props["children"]).toBe(
      "DHA Phase 5, Karachi",
    );
    expect(getByTestId("route-preview-dest").props["children"]).toBe(
      "Karachi Grammar School",
    );
    expect(getByTestId("route-preview-pickup").props["numberOfLines"]).toBe(1);
    expect(getByTestId("route-preview-pickup").props["ellipsizeMode"]).toBe(
      "tail",
    );
    expect(getByTestId("route-preview-dest").props["numberOfLines"]).toBe(1);
    expect(getByTestId("route-preview-dest").props["ellipsizeMode"]).toBe(
      "tail",
    );
    fireEvent.press(getByTestId("route-preview-edit-btn"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/riders");

    // Default round trip shows both Departure and Pickup rows
    expect(getByTestId("departure-time-row")).toBeTruthy();
    expect(getByTestId("pickup-time-row")).toBeTruthy();
  });

  // ─── 4. Switching Rider via Dropdown ────────────────────────────────────────
  it("switches selected rider using RiderDropdown and updates route preview", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

    const { getByTestId } = render(<SearchInputScreen />);

    await waitFor(() => {
      expect(getByTestId("rider-dropdown-trigger")).toBeTruthy();
    });

    // Open dropdown modal
    fireEvent.press(getByTestId("rider-dropdown-trigger"));

    // Select Ali Khan option
    expect(getByTestId(`rider-option-${RIDER_2_ID}`)).toBeTruthy();
    fireEvent.press(getByTestId(`rider-option-${RIDER_2_ID}`));

    // Route preview updates to Ali Khan's addresses
    expect(getByTestId("route-preview-pickup").props["children"]).toBe(
      "Clifton Block 2, Karachi",
    );
    expect(getByTestId("route-preview-dest").props["children"]).toBe(
      "Bay View Academy",
    );
  });

  // ─── 5. Trip Type Pill: Round Trip vs One-Way ──────────────────────────────
  it("toggles between Round Trip and One-Way, hiding Pickup Time for One-Way", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

    const { getByTestId, queryByTestId } = render(<SearchInputScreen />);

    await waitFor(() => {
      expect(getByTestId("trip-type-round-trip")).toBeTruthy();
    });

    // Initially Round Trip: Departure Time row is mounted
    expect(getByTestId("departure-time-row")).toBeTruthy();
    expect(getByTestId("pickup-time-row")).toBeTruthy();

    // Toggle to One-Way
    fireEvent.press(getByTestId("trip-type-one-way"));

    // One-Way retains its departure time and hides the extra pickup segment.
    expect(getByTestId("departure-time-row")).toBeTruthy();
    expect(queryByTestId("pickup-time-row")).toBeNull();

    // Toggle back to Round Trip
    fireEvent.press(getByTestId("trip-type-round-trip"));
    expect(getByTestId("departure-time-row")).toBeTruthy();
  });

  // ─── 6. Operating Day Presets and Chip Toggles ──────────────────────────────
  it("handles day preset tabs and individual day chip toggling", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

    const { getByTestId } = render(<SearchInputScreen />);

    await waitFor(() => {
      expect(getByTestId("preset-weekend")).toBeTruthy();
    });

    // Tap Weekend preset -> Sat (6) and Sun (0) should be active
    fireEvent.press(getByTestId("preset-weekend"));
    expect(
      getByTestId("day-chip-0").props["accessibilityState"]?.selected,
    ).toBe(true);
    expect(
      getByTestId("day-chip-6").props["accessibilityState"]?.selected,
    ).toBe(true);
    expect(
      getByTestId("day-chip-1").props["accessibilityState"]?.selected,
    ).toBe(false);

    // Tap Work preset -> Mon-Fri (1-5) active
    fireEvent.press(getByTestId("preset-work"));
    expect(
      getByTestId("day-chip-1").props["accessibilityState"]?.selected,
    ).toBe(true);
    expect(
      getByTestId("day-chip-5").props["accessibilityState"]?.selected,
    ).toBe(true);
    expect(
      getByTestId("day-chip-0").props["accessibilityState"]?.selected,
    ).toBe(false);

    // Toggle individual day chip (e.g. Wednesday 3)
    fireEvent.press(getByTestId("day-chip-3"));
    expect(
      getByTestId("day-chip-3").props["accessibilityState"]?.selected,
    ).toBe(false);
  });

  // ─── 7. Interactive TimePickerModal ─────────────────────────────────────────
  it("opens TimePickerModal on row press and updates time upon confirmation", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

    const { getByTestId } = render(<SearchInputScreen />);

    await waitFor(() => {
      expect(getByTestId("departure-time-row")).toBeTruthy();
    });

    // Open departure time picker
    fireEvent.press(getByTestId("departure-time-row"));

    // Select hour 9, minute 15, AM
    fireEvent.press(
      getByTestId("wheel-hour").findByProps({ accessibilityLabel: "Hour 9" }),
    );
    fireEvent.press(
      getByTestId("wheel-minute").findByProps({
        accessibilityLabel: "Minute 15",
      }),
    );
    fireEvent.press(
      getByTestId("wheel-period").findByProps({
        accessibilityLabel: "Period AM",
      }),
    );

    // Confirm selection
    fireEvent.press(getByTestId("time-picker-confirm-btn"));

    // Departure time row displays the newly selected time
    expect(
      getByTestId("departure-time-row").props["accessibilityLabel"],
    ).toContain("09:15 AM");
  });

  it("discards unconfirmed wheel changes and restores pickup time on reopening", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });
    const screen = render(<SearchInputScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("pickup-time-row")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("pickup-time-row"));
    fireEvent.press(screen.getByLabelText("Hour 5"));
    fireEvent.press(screen.getByLabelText("Close time picker"));
    expect(
      screen.getByTestId("pickup-time-row").props["accessibilityLabel"],
    ).toContain("04:30 PM");
    fireEvent.press(screen.getByTestId("pickup-time-row"));
    expect(
      screen.getByLabelText("Hour 4").props["accessibilityState"].selected,
    ).toBe(true);
    expect(
      screen.getByLabelText("Minute 30").props["accessibilityState"].selected,
    ).toBe(true);
    expect(
      screen.getByLabelText("Period PM").props["accessibilityState"].selected,
    ).toBe(true);
  });

  it("opens each wheel at its own saved time when switching between legs", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });
    const screen = render(<SearchInputScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("departure-time-row")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("departure-time-row"));
    expect(
      screen.getByLabelText("Hour 8").props["accessibilityState"].selected,
    ).toBe(true);
    fireEvent.press(screen.getByLabelText("Hour 7"));
    fireEvent.press(screen.getByTestId("time-picker-confirm-btn"));
    fireEvent.press(screen.getByTestId("pickup-time-row"));
    expect(
      screen.getByLabelText("Hour 4").props["accessibilityState"].selected,
    ).toBe(true);
    expect(
      screen.getByLabelText("Minute 30").props["accessibilityState"].selected,
    ).toBe(true);
    expect(
      screen.getByLabelText("Period PM").props["accessibilityState"].selected,
    ).toBe(true);
    fireEvent.press(screen.getByTestId("time-picker-confirm-btn"));
    fireEvent.press(screen.getByTestId("departure-time-row"));
    expect(
      screen.getByLabelText("Hour 7").props["accessibilityState"].selected,
    ).toBe(true);
    expect(
      screen.getByLabelText("Minute 30").props["accessibilityState"].selected,
    ).toBe(true);
    expect(
      screen.getByLabelText("Period AM").props["accessibilityState"].selected,
    ).toBe(true);
  });

  it("dismisses unconfirmed time changes from the backdrop and Android back action", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });
    const screen = render(<SearchInputScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("departure-time-row")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("departure-time-row"));
    fireEvent.press(screen.getByLabelText("Hour 7"));
    fireEvent.press(screen.getByLabelText("Dismiss time picker"));
    expect(
      screen.getByTestId("departure-time-row").props["accessibilityLabel"],
    ).toContain("08:30 AM");
    fireEvent.press(screen.getByTestId("departure-time-row"));
    fireEvent.press(screen.getByLabelText("Hour 6"));
    fireEvent(screen.getByTestId("time-picker-modal"), "requestClose");
    expect(
      screen.getByTestId("departure-time-row").props["accessibilityLabel"],
    ).toContain("08:30 AM");
  });

  // ─── 8. Successful Submission: Round Trip ──────────────────────────────────
  it("submits round trip search and navigates to results screen with valid params", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

    const { getByTestId } = render(<SearchInputScreen />);

    await waitFor(() => {
      expect(getByTestId("submit-search-button")).toBeTruthy();
    });

    // Submit form (default: Round Trip, Mon-Fri, 08:30 / 16:30)
    fireEvent.press(getByTestId("submit-search-button"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/(app)/search/results",
        params: {
          riderId: RIDER_1_ID,
          day: "1",
          selectedDays: "1,2,3,4,5",
          departureTime: "08:30",
          subscriptionType: "ROUND_TRIP",
          pickupTime: "16:30",
          riderName: "Sara Ahmed",
          pickupAddress: "DHA Phase 5, Karachi",
          destAddress: "Karachi Grammar School",
        },
      });
    });
  });

  // ─── 9. Successful Submission: One-Way ──────────────────────────────────────
  it("submits one-way search using the departure time", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

    const { getByTestId } = render(<SearchInputScreen />);

    await waitFor(() => {
      expect(getByTestId("trip-type-one-way")).toBeTruthy();
    });

    // Switch to One-Way
    fireEvent.press(getByTestId("trip-type-one-way"));

    // Submit form
    fireEvent.press(getByTestId("submit-search-button"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/(app)/search/results",
        params: {
          riderId: RIDER_1_ID,
          day: "1",
          selectedDays: "1,2,3,4,5",
          departureTime: "08:30",
          subscriptionType: "ONE_WAY",
          riderName: "Sara Ahmed",
          pickupAddress: "DHA Phase 5, Karachi",
          destAddress: "Karachi Grammar School",
        },
      });
    });
  });

  // ─── 10. Back Button Navigation ─────────────────────────────────────────────
  it("navigates back when back button is pressed", async () => {
    mockGet.mockResolvedValueOnce({ data: MOCK_RIDERS });

    const { getByTestId } = render(<SearchInputScreen />);

    await waitFor(() => {
      expect(getByTestId("search-back-button")).toBeTruthy();
    });

    fireEvent.press(getByTestId("search-back-button"));
    expect(mockBack).toHaveBeenCalled();
  });

  // ─── 11. Two-Tier Schema Unit Tests ─────────────────────────────────────────
  describe("Schema and Query Builder Validation", () => {
    it("validates ONE_WAY form state and transforms to contracts query", () => {
      const oneWayForm = {
        riderId: RIDER_1_ID,
        tripType: "ONE_WAY" as const,
        selectedDays: [1, 2, 3],
        departureTime: "08:15",
      };
      const parsed = SearchInputFormStateSchema.parse(oneWayForm);
      const contractQuery = buildDriverSearchQuery(parsed);

      expect(contractQuery.riderId).toBe(RIDER_1_ID);
      expect(contractQuery.subscriptionType).toBe("ONE_WAY");
      expect(contractQuery.departureTime).toBe("08:15");
      expect(contractQuery.pickupTime).toBeUndefined();
    });

    it("validates ROUND_TRIP form state and transforms to contracts query", () => {
      const roundTripForm = {
        riderId: RIDER_1_ID,
        tripType: "ROUND_TRIP" as const,
        selectedDays: [1, 2, 3, 4, 5],
        departureTime: "07:45",
        pickupTime: "15:30",
      };
      const parsed = SearchInputFormStateSchema.parse(roundTripForm);
      const contractQuery = buildDriverSearchQuery(parsed);

      expect(contractQuery.riderId).toBe(RIDER_1_ID);
      expect(contractQuery.subscriptionType).toBe("ROUND_TRIP");
      expect(contractQuery.departureTime).toBe("07:45");
      expect(contractQuery.pickupTime).toBe("15:30");
    });

    it("rejects ROUND_TRIP form when departureTime is missing", () => {
      expect(() =>
        SearchInputFormStateSchema.parse({
          riderId: RIDER_1_ID,
          tripType: "ROUND_TRIP",
          selectedDays: [1],
          pickupTime: "16:00",
        }),
      ).toThrow();
    });

    it("rejects form when no days are selected", () => {
      expect(() =>
        SearchInputFormStateSchema.parse({
          riderId: RIDER_1_ID,
          tripType: "ONE_WAY",
          selectedDays: [],
          pickupTime: "08:00",
        }),
      ).toThrow();
    });
  });

  // ─── 12. Time Utility Unit Tests ────────────────────────────────────────────
  describe("Time Utilities", () => {
    it("converts 24h to 12h accurately", () => {
      expect(to12Hour("08:30")).toEqual({
        hour: 8,
        minute: 30,
        period: "AM",
        formatted: "08:30 AM",
      });
      expect(to12Hour("16:30")).toEqual({
        hour: 4,
        minute: 30,
        period: "PM",
        formatted: "04:30 PM",
      });
      expect(to12Hour("00:00")).toEqual({
        hour: 12,
        minute: 0,
        period: "AM",
        formatted: "12:00 AM",
      });
      expect(to12Hour("12:00")).toEqual({
        hour: 12,
        minute: 0,
        period: "PM",
        formatted: "12:00 PM",
      });
    });

    it("converts 12h to 24h accurately", () => {
      expect(to24Hour(8, 30, "AM")).toBe("08:30");
      expect(to24Hour(4, 30, "PM")).toBe("16:30");
      expect(to24Hour(12, 0, "AM")).toBe("00:00");
      expect(to24Hour(12, 0, "PM")).toBe("12:00");
    });

    it("formats display time correctly", () => {
      expect(formatTimeDisplay("07:15")).toBe("07:15 AM");
      expect(formatTimeDisplay("19:45")).toBe("07:45 PM");
      expect(formatTimeDisplay("invalid")).toBe("08:30 AM");
    });
  });
});

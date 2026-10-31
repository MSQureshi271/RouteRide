/* eslint-disable @typescript-eslint/no-require-imports */
import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { colors } from "@routeride/ui";
import { ServiceAreaEditor } from "../src/service-area/ServiceAreaEditor";

const mockGet = jest.fn();
jest.mock("@routeride/ui", () => {
  const actual = jest.requireActual("@routeride/ui");
  const { Pressable, Text } = require("react-native");
  return {
    ...actual,
    getApiClient: () => ({ get: mockGet }),
    PlaceSearchInput: ({
      testID,
      label,
      onLocationSelected,
    }: {
      testID: string;
      label: string;
      onLocationSelected: (location: {
        lat: number;
        lng: number;
        address: string;
      }) => void;
    }) => (
      <Pressable
        testID={testID}
        onPress={() =>
          onLocationSelected({
            lat: testID.includes("northeast") ? 25 : 24.8,
            lng: testID.includes("northeast") ? 67.2 : 67,
            address: label,
          })
        }
      >
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});
jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: "MapView",
  Polyline: "Polyline",
  Marker: "Marker",
}));
jest.mock("@quidone/react-native-wheel-picker");
const settings = {
  city: "PK-KHI",
  startingLocation: { type: "Point", coordinates: [67.01, 24.86] },
  availability: [{ day: 1, startTime: "06:00", endTime: "08:00" }],
  acceptingRequests: true,
  routeState: "UNSET",
  routePolyline: null,
};
describe("Service-area editor", () => {
  function chooseTime(
    screen: ReturnType<typeof render>,
    hour: number,
    minute: number,
    period: "AM" | "PM",
  ) {
    fireEvent.press(screen.getByLabelText(`Hour ${hour}`));
    fireEvent.press(
      screen.getByLabelText(`Minute ${String(minute).padStart(2, "0")}`),
    );
    fireEvent.press(screen.getByLabelText(`Period ${period}`));
  }
  function addWorkHours(screen: ReturnType<typeof render>) {
    chooseTime(screen, 8, 30, "AM");
    fireEvent.press(screen.getByLabelText("Confirm start time"));
    chooseTime(screen, 4, 30, "PM");
    fireEvent.press(screen.getByLabelText("Confirm end time"));
    fireEvent.press(screen.getByTestId("availability-preset-work"));
    fireEvent.press(screen.getByLabelText("Confirm selected days"));
  }
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      data: {
        settings,
        availabilityVersion: 1,
        rosterVersion: 0,
        requiresSetup: false,
      },
    });
  });
  it("loads saved geometry, confirms time and days, and previews the grouped schedule", async () => {
    const change = jest.fn();
    const screen = render(<ServiceAreaEditor onChange={change} />);
    await waitFor(() => expect(change).toHaveBeenLastCalledWith(settings));
    addWorkHours(screen);
    await waitFor(() =>
      expect(change).toHaveBeenLastCalledWith(
        expect.objectContaining({
          availability: expect.arrayContaining([
            expect.objectContaining({
              day: 5,
              startTime: "08:30",
              endTime: "16:30",
            }),
          ]),
        }),
      ),
    );
    expect(screen.getByText("Mon–Fri")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Remove Mon–Fri 8:30 AM to 4:30 PM"));
    fireEvent(
      screen.getByLabelText("Accept new requests"),
      "valueChange",
      false,
    );
    await waitFor(() =>
      expect(change).toHaveBeenLastCalledWith(
        expect.objectContaining({
          acceptingRequests: false,
          availability: settings.availability,
        }),
      ),
    );
  }, 30000);
  it("uses the driver confirm green for selected days and presets", async () => {
    const screen = render(<ServiceAreaEditor onChange={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId("service-area-start")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("service-area-start"));
    chooseTime(screen, 8, 30, "AM");
    fireEvent.press(screen.getByLabelText("Confirm start time"));
    chooseTime(screen, 4, 30, "PM");
    fireEvent.press(screen.getByLabelText("Confirm end time"));

    expect(
      StyleSheet.flatten(
        screen.getByTestId("availability-day-1").props["style"],
      ),
    ).toMatchObject({
      backgroundColor: colors.secondary,
      borderColor: colors.secondary,
    });
    expect(
      StyleSheet.flatten(
        screen.getByTestId("availability-preset-work").props["style"],
      ),
    ).toMatchObject({
      backgroundColor: colors.secondary,
    });
  });
  it("saves a new driver's schedule with a starting location and city", async () => {
    mockGet.mockResolvedValue({
      data: {
        settings: null,
        availabilityVersion: 1,
        rosterVersion: 0,
        requiresSetup: false,
      },
    });
    const change = jest.fn();
    const screen = render(<ServiceAreaEditor onChange={change} />);
    await waitFor(() =>
      expect(screen.getByTestId("service-area-start")).toBeTruthy(),
    );
    expect(change).toHaveBeenLastCalledWith(null);
    fireEvent.press(screen.getByLabelText("Karachi, Pakistan"));
    fireEvent.press(screen.getByTestId("service-area-start"));
    addWorkHours(screen);
    await waitFor(() =>
      expect(change).toHaveBeenLastCalledWith(
        expect.objectContaining({
          city: "PK-KHI",
          startingLocation: { type: "Point", coordinates: [67, 24.8] },
        }),
      ),
    );
  });
  it("edits Friday hours and merges the preview with Monday through Thursday", async () => {
    mockGet.mockResolvedValue({
      data: {
        settings: {
          ...settings,
          availability: [
            ...[1, 2, 3, 4].map((day) => ({
              day,
              startTime: "08:30",
              endTime: "16:30",
            })),
            { day: 5, startTime: "13:00", endTime: "18:00" },
          ],
        },
        availabilityVersion: 1,
        rosterVersion: 0,
        requiresSetup: false,
      },
    });
    const change = jest.fn();
    const screen = render(<ServiceAreaEditor onChange={change} />);
    await waitFor(() => expect(screen.getByText("Mon–Thu")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Edit Fri 1:00 PM to 6:00 PM"));
    chooseTime(screen, 8, 30, "AM");
    fireEvent.press(screen.getByLabelText("Confirm start time"));
    chooseTime(screen, 4, 30, "PM");
    fireEvent.press(screen.getByLabelText("Confirm end time"));
    fireEvent.press(screen.getByLabelText("Confirm selected days"));
    expect(screen.getByText("Mon–Fri")).toBeTruthy();
    expect(screen.queryByText("Mon–Thu")).toBeNull();
    await waitFor(() =>
      expect(change).toHaveBeenLastCalledWith(
        expect.objectContaining({
          availability: expect.arrayContaining([
            { day: 5, startTime: "08:30", endTime: "16:30" },
          ]),
        }),
      ),
    );
  }, 30000);
  it("requires setup for a legacy driver and retains their established geometry", async () => {
    const routePolyline = {
      type: "LineString",
      coordinates: [
        [67, 24.8],
        [67.1, 24.9],
      ],
    };
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith("service-area")
          ? {
              settings: null,
              availabilityVersion: 0,
              rosterVersion: 0,
              requiresSetup: true,
            }
          : { routePolyline },
      }),
    );
    const change = jest.fn();
    const screen = render(<ServiceAreaEditor onChange={change} />);
    await waitFor(() =>
      expect(screen.getByTestId("service-area-start")).toBeTruthy(),
    );
    expect(change).toHaveBeenLastCalledWith(null);
    fireEvent.press(screen.getByLabelText("Karachi, Pakistan"));
    fireEvent.press(screen.getByTestId("service-area-start"));
    addWorkHours(screen);
    await waitFor(() =>
      expect(change).toHaveBeenLastCalledWith(
        expect.objectContaining({ routeState: "ESTABLISHED", routePolyline }),
      ),
    );
  });
  it("blocks editing on load failure and allows retry", async () => {
    mockGet.mockRejectedValueOnce(new Error("offline"));
    const change = jest.fn();
    const screen = render(<ServiceAreaEditor onChange={change} />);
    await waitFor(() =>
      expect(
        screen.getByText(
          "Could not load your saved service-area settings. Retry before editing.",
        ),
      ).toBeTruthy(),
    );
    expect(change).toHaveBeenLastCalledWith(null);
    fireEvent.press(screen.getByText("Retry service-area settings"));
    await waitFor(() => expect(change).toHaveBeenLastCalledWith(settings));
  });
});

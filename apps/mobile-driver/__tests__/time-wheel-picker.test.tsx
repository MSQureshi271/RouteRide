import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { AvailabilityScheduleEditor } from "../src/service-area/AvailabilityScheduleEditor";
import {
  displayTime,
  TimeWheelPicker,
  timeFromDate,
  toTime24,
} from "../src/service-area/TimeWheelPicker";

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: "MapView",
  Polyline: "Polyline",
  Marker: "Marker",
}));
jest.mock("@quidone/react-native-wheel-picker");

describe("Driver time wheel", () => {
  it("uses the same wheel for hour, minute, and period with a lavender selection", () => {
    const screen = render(
      <TimeWheelPicker
        value={{ hour: 8, minute: 30, period: "AM" }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId("wheel-hour")).toBeTruthy();
    expect(screen.getByTestId("wheel-minute")).toBeTruthy();
    const band = screen.getByTestId("time-selection-band");
    expect(StyleSheet.flatten(band.props["style"]).backgroundColor).toBe(
      "#EEF2FF",
    );
    expect(screen.getAllByTestId(/wheel-/)).toHaveLength(3);
  });
  it("uses Karachi current time and converts noon and midnight correctly", () => {
    expect(timeFromDate(new Date("2026-10-24T08:45:00Z"))).toEqual({
      hour: 1,
      minute: 45,
      period: "PM",
    });
    expect(toTime24({ hour: 12, minute: 0, period: "AM" })).toBe("00:00");
    expect(toTime24({ hour: 12, minute: 0, period: "PM" })).toBe("12:00");
    expect(displayTime("16:30")).toBe("4:30 PM");
  });
  it("allows a screen reader to adjust a wheel", () => {
    const onChange = jest.fn();
    const screen = render(
      <TimeWheelPicker
        value={{ hour: 8, minute: 30, period: "AM" }}
        onChange={onChange}
      />,
    );
    fireEvent(screen.getByLabelText("Hour wheel"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(onChange).toHaveBeenCalledWith({
      hour: 9,
      minute: 30,
      period: "AM",
    });
  });
  it("resets the wheel to current time after the start is confirmed", () => {
    const screen = render(
      <AvailabilityScheduleEditor availability={[]} onChange={jest.fn()} />,
    );
    fireEvent.press(screen.getByLabelText("Hour 8"));
    fireEvent.press(screen.getByLabelText("Minute 30"));
    fireEvent.press(screen.getByLabelText("Period AM"));
    fireEvent.press(screen.getByLabelText("Confirm start time"));
    expect(screen.getByText("Start  8:30 AM")).toBeTruthy();
    const now = timeFromDate(new Date());
    expect(
      screen.getByLabelText(`Hour ${now.hour}`).props["accessibilityState"]
        .selected,
    ).toBe(true);
    expect(
      screen.getByLabelText(`Minute ${String(now.minute).padStart(2, "0")}`)
        .props["accessibilityState"].selected,
    ).toBe(true);
    expect(
      screen.getByLabelText(`Period ${now.period}`).props["accessibilityState"]
        .selected,
    ).toBe(true);
  });
  it("rejects an earlier end and applies a custom day selection", () => {
    const onChange = jest.fn();
    const screen = render(
      <AvailabilityScheduleEditor availability={[]} onChange={onChange} />,
    );
    fireEvent.press(screen.getByLabelText("Hour 8"));
    fireEvent.press(screen.getByLabelText("Minute 30"));
    fireEvent.press(screen.getByLabelText("Period AM"));
    fireEvent.press(screen.getByLabelText("Confirm start time"));
    fireEvent.press(screen.getByLabelText("Hour 7"));
    fireEvent.press(screen.getByLabelText("Minute 00"));
    fireEvent.press(screen.getByLabelText("Period AM"));
    fireEvent.press(screen.getByLabelText("Confirm end time"));
    expect(
      screen.getByText(
        "End time must be later than start time on the same day.",
      ),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("Period PM"));
    fireEvent.press(screen.getByLabelText("Confirm end time"));
    fireEvent.press(screen.getByTestId("availability-preset-weekend"));
    fireEvent.press(screen.getByTestId("availability-day-0"));
    fireEvent.press(screen.getByLabelText("Confirm selected days"));
    expect(onChange).toHaveBeenCalledWith([
      { day: 6, startTime: "08:30", endTime: "19:00" },
    ]);
  });
});

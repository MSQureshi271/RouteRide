import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import AppLayout from "../app/(app)/_layout";
import ConsumerHomeScreen from "../app/(app)/index";

const mockPush = jest.fn();
const mockScreens: Array<{ name: string; options?: Record<string, unknown> }> =
  [];

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: "MapView",
  Polyline: "Polyline",
  Marker: "Marker",
}));

jest.mock("expo-router", () => {
  const Tabs = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Tabs.Screen = (props: {
    name: string;
    options?: Record<string, unknown>;
  }) => {
    mockScreens.push(props);
    return null;
  };
  return {
    Tabs,
    Redirect: () => null,
    router: { push: (...args: unknown[]) => mockPush(...args) },
  };
});

jest.mock("@routeride/ui", () => {
  const actual = jest.requireActual("@routeride/ui");
  const state = { accessToken: "token", user: null, logout: jest.fn() };
  return {
    ...actual,
    useAuthStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

describe("search navigation", () => {
  beforeEach(() => {
    mockScreens.length = 0;
    mockPush.mockClear();
  });

  it("keeps search navigable without displaying a tab button", () => {
    render(<AppLayout />);
    const search = mockScreens.find((screen) => screen.name === "search");
    expect(search).toBeDefined();
    expect(search?.options?.["href"]).not.toBeNull();
    expect(search?.options?.["hidden"]).not.toBe(true);
    expect(search?.options?.["tabBarButton"]).toEqual(expect.any(Function));
    expect(search?.options?.["tabBarItemStyle"]).toEqual({ display: "none" });

    const home = render(<ConsumerHomeScreen />);
    fireEvent.press(home.getByTestId("search-drivers-button"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/search");
  });
});

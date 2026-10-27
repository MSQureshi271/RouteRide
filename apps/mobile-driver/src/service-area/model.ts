import {
  DriverServiceAreaSettingsSchema,
  type DriverServiceAreaSettings,
} from "@routeride/contracts";

export interface ServiceAreaDraft {
  savedArea: DriverServiceAreaSettings["serviceArea"] | null;
  southwest: [number, number] | null;
  northeast: [number, number] | null;
  startingLocation: DriverServiceAreaSettings["startingLocation"] | null;
  availability: DriverServiceAreaSettings["availability"];
  acceptingRequests: boolean;
  routeState: DriverServiceAreaSettings["routeState"];
  routePolyline: DriverServiceAreaSettings["routePolyline"];
}

export type AvailabilityWindow = ServiceAreaDraft["availability"][number];
export type AvailabilityGroup = {
  startTime: string;
  endTime: string;
  days: number[];
};

const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
export const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function groupAvailability(
  windows: ServiceAreaDraft["availability"],
): AvailabilityGroup[] {
  const groups = new Map<string, AvailabilityGroup>();
  for (const window of windows) {
    const key = `${window.startTime}-${window.endTime}`;
    const group = groups.get(key) ?? {
      startTime: window.startTime,
      endTime: window.endTime,
      days: [],
    };
    if (!group.days.includes(window.day)) group.days.push(window.day);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      days: weekdayOrder.filter((day) => group.days.includes(day)),
    }))
    .sort(
      (a, b) =>
        weekdayOrder.indexOf(a.days[0]!) - weekdayOrder.indexOf(b.days[0]!) ||
        a.startTime.localeCompare(b.startTime),
    );
}

export function formatGroupDays(days: number[]): string {
  const indexes = weekdayOrder
    .map((day, index) => (days.includes(day) ? index : -1))
    .filter((index) => index !== -1);
  const runs: string[] = [];
  for (let i = 0; i < indexes.length;) {
    let end = i;
    while (end + 1 < indexes.length && indexes[end + 1] === indexes[end]! + 1)
      end++;
    const first = weekdayNames[weekdayOrder[indexes[i]!]!]!;
    const last = weekdayNames[weekdayOrder[indexes[end]!]!]!;
    runs.push(
      end - i >= 2
        ? `${first}–${last}`
        : end === i
          ? first
          : `${first}, ${last}`,
    );
    i = end + 1;
  }
  return runs.join(", ");
}

export function replaceAvailabilityGroup(
  windows: ServiceAreaDraft["availability"],
  original: AvailabilityGroup | null,
  next: AvailabilityGroup,
): ServiceAreaDraft["availability"] {
  if (next.days.length === 0) throw new Error("Select at least one day.");
  if (next.startTime >= next.endTime)
    throw new Error("End time must be later than start time on the same day.");
  const remaining = original
    ? windows.filter(
        (window) =>
          !(
            original.days.includes(window.day) &&
            window.startTime === original.startTime &&
            window.endTime === original.endTime
          ),
      )
    : windows;
  const result = [
    ...remaining,
    ...next.days.map((day) => ({
      day,
      startTime: next.startTime,
      endTime: next.endTime,
    })),
  ];
  if (result.length > 56)
    throw new Error("You can save up to 56 day and time ranges.");
  for (const window of result) {
    if (
      result.some(
        (other) =>
          other !== window &&
          other.day === window.day &&
          window.startTime < other.endTime &&
          other.startTime < window.endTime,
      )
    ) {
      throw new Error(
        `${weekdayNames[window.day]} already has an overlapping time range.`,
      );
    }
  }
  return result.sort(
    (a, b) =>
      weekdayOrder.indexOf(a.day) - weekdayOrder.indexOf(b.day) ||
      a.startTime.localeCompare(b.startTime),
  );
}

export function buildServiceAreaSettings(
  draft: ServiceAreaDraft,
): DriverServiceAreaSettings {
  const serviceArea = draft.savedArea ?? (draft.southwest && draft.northeast
    ? {
        type: "Polygon" as const,
        coordinates: [[
          draft.southwest,
          [draft.northeast[0], draft.southwest[1]],
          draft.northeast,
          [draft.southwest[0], draft.northeast[1]],
          draft.southwest,
        ]],
      }
    : null);
  if (!serviceArea) throw new Error("Choose both service-area corners.");
  if (!draft.startingLocation)
    throw new Error("Choose your starting location.");
  const parsed = DriverServiceAreaSettingsSchema.safeParse({
    serviceArea,
    startingLocation: draft.startingLocation,
    availability: draft.availability,
    acceptingRequests: draft.acceptingRequests,
    routeState: draft.routeState,
    routePolyline: draft.routePolyline,
  });
  if (!parsed.success)
    throw new Error(
      "Offer at least one day with valid availability times (HH:mm), ending after they start.",
    );
  return parsed.data;
}

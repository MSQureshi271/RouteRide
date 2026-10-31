import {
  buildServiceAreaSettings,
  formatGroupDays,
  groupAvailability,
  replaceAvailabilityGroup,
  type ServiceAreaDraft,
} from "../src/service-area/model";

const draft: ServiceAreaDraft = {
  city: "PK-KHI",
  startingLocation: { type: "Point", coordinates: [67.01, 24.86] },
  availability: [{ day: 1, startTime: "06:00", endTime: "10:00" }],
  acceptingRequests: true,
  routeState: "UNSET",
  routePolyline: null,
};

describe("Declared service area settings", () => {
  it("saves the operating city without a service area", () => {
    const result = buildServiceAreaSettings(draft);
    expect(result.city).toBe("PK-KHI");
    expect(result).not.toHaveProperty("serviceArea");
    expect(result.routePolyline).toBeNull();
    expect(result.availability).toHaveLength(1);
  });
  it("preserves an established route", () => {
    const routePolyline = {
      type: "LineString" as const,
      coordinates: [
        [67.01, 24.86],
        [67.1, 24.9],
      ] as [number, number][],
    };
    const result = buildServiceAreaSettings({
      ...draft,
      routeState: "ESTABLISHED",
      routePolyline,
    });
    expect(result.routePolyline).toEqual(routePolyline);
  });
  it("rejects missing starting location and invalid time windows", () => {
    expect(() => buildServiceAreaSettings({ ...draft, city: null })).toThrow();
    expect(() =>
      buildServiceAreaSettings({ ...draft, startingLocation: null }),
    ).toThrow();
    expect(() =>
      buildServiceAreaSettings({
        ...draft,
        availability: [
          { ...draft.availability[0]!, startTime: "23:00", endTime: "01:00" },
        ],
      }),
    ).toThrow();
    expect(() =>
      buildServiceAreaSettings({ ...draft, availability: [] }),
    ).toThrow();
  });
  it("allows separate same-day intervals and rejects overlapping availability", () => {
    const valid = buildServiceAreaSettings({
      ...draft,
      availability: [
        { day: 1, startTime: "06:00", endTime: "10:00" },
        { day: 1, startTime: "13:00", endTime: "18:00" },
      ],
    });
    expect(valid.availability).toHaveLength(2);
    expect(() =>
      buildServiceAreaSettings({
        ...draft,
        availability: [
          { day: 1, startTime: "06:00", endTime: "10:00" },
          { day: 1, startTime: "09:59", endTime: "12:00" },
        ],
      }),
    ).toThrow();
  });
  it("groups equal hours and regroups after an edited Friday joins work days", () => {
    const initial = [1, 2, 3, 4].map((day) => ({
      day,
      startTime: "08:30",
      endTime: "16:30",
    }));
    initial.push({ day: 5, startTime: "13:00", endTime: "18:00" });
    const groups = groupAvailability(initial);
    expect(groups).toEqual([
      { days: [1, 2, 3, 4], startTime: "08:30", endTime: "16:30" },
      { days: [5], startTime: "13:00", endTime: "18:00" },
    ]);
    expect(formatGroupDays(groups[0]!.days)).toBe("Mon–Thu");
    const next = replaceAvailabilityGroup(initial, groups[1]!, {
      days: [5],
      startTime: "08:30",
      endTime: "16:30",
    });
    expect(groupAvailability(next)).toEqual([
      { days: [1, 2, 3, 4, 5], startTime: "08:30", endTime: "16:30" },
    ]);
    expect(formatGroupDays(groupAvailability(next)[0]!.days)).toBe("Mon–Fri");
  });
  it("rejects overlapping ranges and accepts touching ranges", () => {
    const first = [{ day: 1, startTime: "08:30", endTime: "12:00" }];
    expect(() =>
      replaceAvailabilityGroup(first, null, {
        days: [1],
        startTime: "11:59",
        endTime: "18:00",
      }),
    ).toThrow(/overlapping/);
    expect(
      replaceAvailabilityGroup(first, null, {
        days: [1],
        startTime: "12:00",
        endTime: "18:00",
      }),
    ).toHaveLength(2);
  });
});

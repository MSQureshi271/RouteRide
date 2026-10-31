import {
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ServiceAreaService } from "./service-area.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { DriverServiceAreaSettings } from "@routeride/contracts";

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    LAUNCH_CITY_BBOX_MIN_LAT: 24.7,
    LAUNCH_CITY_BBOX_MAX_LAT: 25.15,
    LAUNCH_CITY_BBOX_MIN_LON: 66.85,
    LAUNCH_CITY_BBOX_MAX_LON: 67.35,
  }),
}));

const settings: DriverServiceAreaSettings = {
  city: "PK-KHI",
  startingLocation: { type: "Point" as const, coordinates: [67.02, 24.82] },
  availability: [
    {
      day: 1,
      startTime: "06:00",
      endTime: "10:00",
    },
  ],
  acceptingRequests: true,
  routeState: "UNSET" as const,
  routePolyline: null,
};

describe("ServiceAreaService", () => {
  function setup(active = false, safe = false) {
    const query = jest.fn(
      async (
        text: string,
        _values?: unknown[],
      ): Promise<{ rows: Record<string, unknown>[] }> => {
        if (text.includes("FOR UPDATE"))
          return { rows: [{ id: "driver", coverage_setup_required: true }] };
        if (text.includes("AS safe")) return { rows: [{ safe }] };
        if (text.includes("FROM subscriptions"))
          return { rows: active ? [{ id: "sub" }] : [] };
        if (text.includes("AS valid")) return { rows: [{ valid: true }] };
        return { rows: [] };
      },
    );
    const release = jest.fn();
    const prisma = {
      pool: { connect: jest.fn().mockResolvedValue({ query, release }) },
    };
    return {
      service: new ServiceAreaService(prisma as unknown as PrismaService),
      query,
      release,
    };
  }

  it("saves route-free coverage atomically without creating a route", async () => {
    const { service, query, release } = setup();
    await service.save("owner", settings);
    const updates = query.mock.calls.filter(([sql]) =>
      sql.includes("UPDATE driver_profiles"),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.[0]).toContain(
      "availability_version = availability_version + 1",
    );
    expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(true);
    expect(release).toHaveBeenCalled();
  });

  it("rejects coverage edits that could strand active riders and rolls back", async () => {
    const { service, query, release } = setup(true);
    await expect(service.save("owner", settings)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      query.mock.calls.some(([sql]) => sql.includes("UPDATE driver_profiles")),
    ).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(release).toHaveBeenCalled();
  });

  it("allows additive legacy coverage declaration when every commitment is preserved", async () => {
    const { service, query } = setup(true, true);
    await service.save("owner", settings);
    expect(
      query.mock.calls.some(([sql]) => sql.includes("UPDATE driver_profiles")),
    ).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(true);
  });

  it("protects paused commitments and maps serialization conflicts to a retryable 409", async () => {
    const { service, query, release } = setup();
    query.mockRejectedValueOnce(
      Object.assign(new Error("serialization"), { code: "40001" }),
    );
    await expect(service.save("owner", settings)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(release).toHaveBeenCalled();
    const active = setup(true);
    await expect(active.service.save("owner", settings)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      active.query.mock.calls.some(([text]) => text.includes("'PAUSED'")),
    ).toBe(true);
  });

  it("reads settings and offered windows in one database snapshot", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: "driver",
        operating_city: settings.city,
        starting_location: settings.startingLocation,
        route_polyline: null,
        route_state: "UNSET",
        accepting_requests: true,
        availability: settings.availability,
        availability_version: 2,
        roster_version: 3,
        coverage_setup_required: false,
      },
    ]);
    const service = new ServiceAreaService({
      query,
    } as unknown as PrismaService);
    await expect(service.get("owner")).resolves.toMatchObject({
      settings,
      availabilityVersion: 2,
      rosterVersion: 3,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects coverage outside platform bounds before opening a transaction", async () => {
    const { service, query } = setup();
    const outside = structuredClone(settings);
    outside.startingLocation.coordinates = [65, 24.8];
    await expect(service.save("owner", outside)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(query).not.toHaveBeenCalled();
  });
});

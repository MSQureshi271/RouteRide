import { ForbiddenException } from "@nestjs/common";
import { ServiceUnavailableWithRetryException } from "../common/service-unavailable-retry.exception.js";
import { SearchService } from "./search.service.js";
import type { MatchingClient } from "./matching.client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type Redis from "ioredis";

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    LAUNCH_CITY_BBOX_MIN_LAT: 24.7,
    LAUNCH_CITY_BBOX_MAX_LAT: 25.15,
    LAUNCH_CITY_BBOX_MIN_LON: 66.85,
    LAUNCH_CITY_BBOX_MAX_LON: 67.35,
    MATCHING_CONFIG_VERSION: "2",
  }),
}));

const driverId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const query = {
  riderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  day: 1,
  departureTime: "07:00",
  subscriptionType: "ONE_WAY" as const,
  page: 1,
  pageSize: 20,
};
const upstream = {
  version: "v2",
  policyVersion: "city-v2.2:2",
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    hasMore: false,
  },
  results: [
    {
      driverProfileId: driverId,
      routeState: "UNSET",
      pickupDistanceMeters: null,
      destDistanceMeters: null,
      availableSeats: 3,
      availabilityStatus: "AVAILABLE",
      reviewStatus: "REQUIRED",
      avgRating: null,
      reviewCount: 0,
      compositeScore: 0.5,
      scoreBreakdown: {
        proximityScore: 0.5,
        timingScore: 0.5,
        ratingScore: 0.7,
        capacityScore: 1,
        acceptanceScore: 0.8,
      },
    },
  ],
};

describe("v2 discovery gateway", () => {
  function setup(owned = true) {
    let revision = "1:2:3";
    const sql = jest.fn(async (parts: TemplateStringsArray) => {
      const statement = parts.join("?");
      if (statement.includes("JOIN consumer_profiles"))
        return owned
          ? [
              {
                id: query.riderId,
                home_lat: 24.82,
                home_lng: 67.02,
                dest_lat: 24.86,
                dest_lng: 67.06,
              },
            ]
          : [];
      if (statement.includes("FROM riders")) return [{ id: query.riderId }];
      if (statement.includes("SUM(availability_version)"))
        return [{ revision }];
      return [
        {
          driver_profile_id: driverId,
          driver_name: "Driver",
          vehicle_make: "Suzuki",
          vehicle_model: "Bolan",
          vehicle_colour: "White",
          base_price_cents: 1000000,
          currency: "PKR",
        },
      ];
    });
    const client = { discover: jest.fn().mockResolvedValue(upstream) };
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue("OK"),
      del: jest.fn(),
    };
    const service = new SearchService(
      { sql } as unknown as PrismaService,
      client as unknown as MatchingClient,
      cache as unknown as Redis,
    );
    return {
      service,
      client,
      cache,
      setRevision: (value: string) => {
        revision = value;
      },
    };
  }

  it("returns honest nullable route distances and strips private ranking fields", async () => {
    const { service, client } = setup();
    const result = await service.discover("owner", query);
    expect(result.results[0]).toMatchObject({
      routeState: "UNSET",
      pickupDistanceMeters: null,
      driverName: "Driver",
    });
    expect(result.results[0]).not.toHaveProperty("compositeScore");
    expect(result.results[0]).not.toHaveProperty("scoreBreakdown");
    expect(client.discover).toHaveBeenCalled();
  });

  it("checks ownership before consulting a shared cache", async () => {
    const { service, client, cache } = setup(false);
    await expect(service.discover("stranger", query)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.discover).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
  });

  it("uses separate cache entries for pagination", async () => {
    const { service, cache } = setup();
    await service.discover("owner", query);
    await service.discover("owner", { ...query, page: 2 });
    expect(cache.get.mock.calls[0]?.[0]).not.toEqual(
      cache.get.mock.calls[1]?.[0],
    );
  });

  it("invalidates a shared response after a coverage or roster revision", async () => {
    const { service, cache, setRevision } = setup();
    await service.discover("owner", query);
    setRevision("1:3:4");
    await service.discover("owner", query);
    expect(cache.get.mock.calls[0]?.[0]).not.toEqual(
      cache.get.mock.calls[1]?.[0],
    );
    expect(cache.get.mock.calls[0]?.[0]).toContain("city-v2.2:2");
  });

  it("rejects mixed policy deployments rather than caching incompatible results", async () => {
    const { service, client, cache } = setup();
    client.discover.mockResolvedValueOnce({
      ...upstream,
      policyVersion: "old-policy",
    });
    await expect(service.discover("owner", query)).rejects.toBeInstanceOf(
      ServiceUnavailableWithRetryException,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("enforces the gateway deadline when a cache is unavailable", async () => {
    const { service, cache, client } = setup();
    service.gatewayDeadlineMs = 10;
    cache.get.mockImplementationOnce(() => new Promise(() => {}));
    await expect(service.discover("owner", query)).rejects.toBeInstanceOf(
      ServiceUnavailableWithRetryException,
    );
    expect(client.discover).not.toHaveBeenCalled();
  });
});

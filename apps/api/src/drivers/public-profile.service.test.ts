import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DriverDiscoveryQueryV2Schema } from "@routeride/contracts";
import { PublicProfileService } from "./public-profile.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { RequestabilityService } from "../subscriptions/requestability.service.js";

const driverId = "550e8400-e29b-41d4-a716-446655440001";
const query = DriverDiscoveryQueryV2Schema.parse({
  riderId: "550e8400-e29b-41d4-a716-446655440002",
  day: 1,
  departureTime: "07:30",
  subscriptionType: "ONE_WAY",
});
const rider = {
  owner: "consumer",
  home_lat: 24.9,
  home_lng: 67.1,
  dest_lat: 24.91,
  dest_lng: 67.11,
};
describe("Public driver profile", () => {
  const dbQuery = jest.fn();
  const inspect = jest.fn();
  const pool = {};
  const service = new PublicProfileService(
    { query: dbQuery, pool } as unknown as PrismaService,
    { inspect } as unknown as RequestabilityService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    inspect.mockResolvedValue({
      monthlyPriceCents: 1500000,
      currency: "PKR",
      availableSeats: 3,
    });
  });
  it.each([
    [[], NotFoundException],
    [[{ ...rider, owner: "other" }], ForbiddenException],
    [[{ ...rider, home_lat: null }], BadRequestException],
  ])(
    "rejects absent, foreign and unconfigured rider context",
    async (rows, exception) => {
      dbQuery.mockResolvedValueOnce(rows);
      await expect(
        service.get("consumer", driverId, query, 1),
      ).rejects.toBeInstanceOf(exception);
      expect(inspect).not.toHaveBeenCalled();
    },
  );
  it("blocks direct access to a driver who is no longer requestable", async () => {
    dbQuery.mockResolvedValueOnce([rider]);
    inspect.mockRejectedValueOnce(
      new UnprocessableEntityException("Unavailable"),
    );
    await expect(
      service.get("consumer", driverId, query, 1),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });
  function mockProfile() {
    dbQuery
      .mockResolvedValueOnce([rider])
      .mockResolvedValueOnce([
        {
          driver_name: "Driver",
          photo_url: null,
          vehicle_make: "Toyota",
          vehicle_model: "HiAce",
          vehicle_colour: "White",
          vehicle_year: 2020,
          plate_number: "ABC-123",
          verification_tier: "BASIC",
          route_state: "UNSET",
          pickup_distance: null,
          dest_distance: null,
          starting_location: "PRIVATE",
          route_polyline: "PRIVATE",
          roster: "PRIVATE",
          phone: "PRIVATE",
        },
      ])
      .mockResolvedValueOnce([{ rating: 5, count: 11 }])
      .mockResolvedValueOnce([
        {
          rating: 5,
          comment: "Reliable",
          created_at: new Date("2026-10-01T12:00:00Z"),
          author_id: "PRIVATE",
        },
      ]);
  }
  it("returns an explicit privacy allowlist with anonymous verified reviews and truthful no-route distances", async () => {
    mockProfile();
    const result = await service.get("consumer", driverId, query, 1);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(Object.keys(result).sort()).toEqual(
      [
        "driver",
        "photoUrl",
        "vehicleYear",
        "plateNumber",
        "verificationTier",
        "ratingDistribution",
        "reviews",
        "reviewsPagination",
      ].sort(),
    );
    expect(result.driver).toMatchObject({
      pickupDistanceMeters: null,
      destDistanceMeters: null,
      availableSeats: 3,
      avgRating: 5,
    });
    expect(result.reviewsPagination).toMatchObject({
      hasMore: true,
      total: 11,
    });
    expect(dbQuery.mock.calls[2]?.[0]).toContain("t.status='COMPLETED'");
    expect(dbQuery.mock.calls[3]?.[0]).toContain(
      "t.actual_dropoff_at <= r.created_at",
    );
  });
  it("preserves override locations and reverses the afternoon round-trip leg", async () => {
    mockProfile();
    await service.get(
      "consumer",
      driverId,
      {
        ...query,
        subscriptionType: "ROUND_TRIP",
        pickupTime: "14:00",
        pickupLat: 24.92,
        pickupLng: 67.12,
      },
      2,
    );
    expect(inspect).toHaveBeenCalledWith(pool, driverId, {
      operatingDays: [1],
      legs: [
        expect.objectContaining({
          legType: "DEPARTURE",
          pickupLocation: { type: "Point", coordinates: [67.12, 24.92] },
        }),
        expect.objectContaining({
          legType: "PICKUP",
          dropoffLocation: { type: "Point", coordinates: [67.12, 24.92] },
          pickupWindowStart: "14:00",
        }),
      ],
    });
    expect(dbQuery.mock.calls[3]?.[1]).toEqual([driverId, 10]);
  });
});

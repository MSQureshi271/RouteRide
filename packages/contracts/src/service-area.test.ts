import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DriverServiceAreaSettingsSchema,
  InternalDiscoveryRequestV2Schema,
  InternalDiscoveryCandidateV2Schema,
  DriverDiscoveryResultV2Schema,
  FeasibilityProposalV2Schema,
  RequestSubscriptionV2Schema,
  SubStatusSchema,
  DiscoveryPaginationV2Schema,
  DriverDiscoveryQueryV2Schema,
  GeoPolygonSchema,
} from "./index.js";

interface Vector {
  id: string;
  input: unknown;
  valid: boolean;
}
const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, "../test-vectors/service-area-v2.json"),
    "utf8",
  ),
) as {
  settings: Vector[];
  discoveryRequests: Vector[];
  candidates: Vector[];
  proposals: Vector[];
  subscriptionRequests: Vector[];
  lifecycleOutcomes: string[];
  publicResult: Record<string, unknown>;
};

describe("Service-area v2 contracts", () => {
  it.each(
    fixture.settings.filter(
      ({ id }) =>
        !["unclosed-polygon", "degenerate-polygon", "invalid-wgs84"].includes(
          id,
        ),
    ),
  )("validates settings: $id", ({ input, valid }) => {
    const { serviceArea: _oldArea, ...rest } = input as Record<string, unknown>;
    expect(
      DriverServiceAreaSettingsSchema.safeParse({ ...rest, city: "PK-KHI" })
        .success,
    ).toBe(valid);
  });
  it("requires a supported city and no polygon", () => {
    const { serviceArea: _oldArea, ...rest } = fixture.settings[0]!
      .input as Record<string, unknown>;
    expect(
      DriverServiceAreaSettingsSchema.safeParse({ ...rest, city: "PK-KHI" })
        .success,
    ).toBe(true);
    expect(
      DriverServiceAreaSettingsSchema.safeParse({ ...rest, city: "OTHER" })
        .success,
    ).toBe(false);
  });
  it.each(fixture.discoveryRequests)(
    "validates discovery request: $id",
    ({ input, valid }) => {
      expect(InternalDiscoveryRequestV2Schema.safeParse(input).success).toBe(
        valid,
      );
    },
  );
  it.each(fixture.candidates)(
    "validates route distances: $id",
    ({ input, valid }) => {
      expect(InternalDiscoveryCandidateV2Schema.safeParse(input).success).toBe(
        valid,
      );
    },
  );
  it.each(fixture.proposals)("validates proposal: $id", ({ input, valid }) => {
    expect(FeasibilityProposalV2Schema.safeParse(input).success).toBe(valid);
  });
  it.each(fixture.subscriptionRequests)(
    "validates recurring request: $id",
    ({ input, valid }) => {
      expect(RequestSubscriptionV2Schema.safeParse(input).success).toBe(valid);
    },
  );
  it("includes every terminal request outcome", () => {
    for (const status of fixture.lifecycleOutcomes)
      expect(SubStatusSchema.safeParse(status).success).toBe(true);
  });
  it("coerces pagination from URL query strings without requiring location overrides", () => {
    const parsed = DriverDiscoveryQueryV2Schema.parse({
      riderId: "550e8400-e29b-41d4-a716-446655440000",
      day: "1",
      departureTime: "07:30",
      subscriptionType: "ONE_WAY",
      page: "2",
      pageSize: "10",
    });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(10);
    expect(parsed.pickupLat).toBeUndefined();
  });
  it("rejects pagination metadata that hides remaining available drivers", () => {
    expect(
      DiscoveryPaginationV2Schema.safeParse({
        page: 1,
        pageSize: 20,
        total: 21,
        hasMore: false,
      }).success,
    ).toBe(false);
    expect(
      DiscoveryPaginationV2Schema.safeParse({
        page: 1,
        pageSize: 20,
        total: 21,
        hasMore: true,
      }).success,
    ).toBe(true);
  });
  it("requires complete coordinate overrides and bounds polygon payload size", () => {
    const query = {
      riderId: "550e8400-e29b-41d4-a716-446655440000",
      day: 1,
      departureTime: "07:30",
      subscriptionType: "ONE_WAY",
    };
    expect(
      DriverDiscoveryQueryV2Schema.safeParse({ ...query, pickupLat: 24.8 })
        .success,
    ).toBe(false);
    expect(
      DriverDiscoveryQueryV2Schema.safeParse({ ...query, destLng: 67 }).success,
    ).toBe(false);
    const ring = [
      [67, 24.8],
      [67.2, 24.8],
      [67.2, 25],
      [67, 25],
      [67, 24.8],
    ];
    expect(
      GeoPolygonSchema.safeParse({
        type: "Polygon",
        coordinates: Array.from({ length: 11 }, () => ring),
      }).success,
    ).toBe(false);
    expect(
      GeoPolygonSchema.safeParse({
        type: "Polygon",
        coordinates: [Array.from({ length: 101 }, () => [67, 24.8])],
      }).success,
    ).toBe(false);
  });
  it("rejects private scores and other rider geometry on public results", () => {
    expect(
      DriverDiscoveryResultV2Schema.safeParse({
        ...fixture.publicResult,
        compositeScore: 0.9,
      }).success,
    ).toBe(false);
    expect(
      DriverDiscoveryResultV2Schema.safeParse({
        ...fixture.publicResult,
        stops: [],
      }).success,
    ).toBe(false);
    expect(
      DriverDiscoveryResultV2Schema.safeParse(fixture.publicResult).success,
    ).toBe(true);
  });
});

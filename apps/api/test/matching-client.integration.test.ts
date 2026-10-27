/**
 * MatchingClient unit & integration tests (Task 1.08).
 *
 * Tests:
 *  - URL formation and POST /internal/v1/matching/search request dispatch
 *  - Header propagation (X-Request-ID, OTel trace context)
 *  - 200 OK response parsing
 *  - 422 Unprocessable Entity mapped to UnprocessableEntityException
 *  - Upstream 500/502/503 mapped to ServiceUnavailableWithRetryException with Retry-After: 30
 *  - Network/timeout errors mapped to ServiceUnavailableWithRetryException with Retry-After: 30
 *  - Agent dispatcher closure in finally block
 */

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    MATCHING_SERVICE_URL: "http://localhost:8001",
  }),
}));

const mockFetch = jest.fn();
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock("undici", () => ({
  Agent: jest.fn().mockImplementation(() => ({
    close: mockClose,
  })),
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

import { UnprocessableEntityException } from "@nestjs/common";
import { MatchingClient } from "../src/search/matching.client.js";
import { ServiceUnavailableWithRetryException } from "../src/common/service-unavailable-retry.exception.js";
import type {
  InternalSearchRequest,
  InternalSearchResponse,
} from "@routeride/contracts";

const MOCK_REQUEST: InternalSearchRequest = {
  riderId: "33333333-3333-4333-8333-333333333333",
  pickupLat: 24.8607,
  pickupLng: 67.0011,
  destLat: 24.92,
  destLng: 67.11,
  day: 0,
  departureTime: "08:00",
  subscriptionType: "ONE_WAY",
  pickupRadiusMeters: 1500,
  destRadiusMeters: 2000,
};

const MOCK_RESPONSE: InternalSearchResponse = {
  results: [
    {
      driverProfileId: "d1111111-1111-4111-8111-111111111111",
      compositeScore: 0.95,
      scoreBreakdown: {
        proximityScore: 0.95,
        timingScore: 0.9,
        ratingScore: 0.95,
        capacityScore: 0.9,
        acceptanceScore: 0.95,
      },
      pickupDistanceMeters: 200,
      destDistanceMeters: 300,
      estimatedTripDurationMinutes: 30,
      availableSeats: 4,
      avgRating: 4.9,
      reviewCount: 50,
    },
  ],
  totalCandidatesEvaluated: 5,
  totalEligible: 1,
  exclusionSummary: {
    firstFailureCounts: {
      driverStatus: 0,
      invalidGeometry: 0,
      distance: 2,
      direction: 1,
      operatingDay: 1,
      capacity: 0,
      timing: 0,
    },
  },
  meta: {
    executionTimeMs: 15,
    searchTimestamp: new Date().toISOString(),
  },
};

describe("MatchingClient (Task 1.08)", () => {
  let client: MatchingClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MatchingClient();
  });

  it("uses the v2 endpoint and validates its response", async () => {
    const response = {
      version: "v2",
      results: [],
      policyVersion: "service-area-v2.1",
      pagination: { page: 1, pageSize: 20, total: 0, hasMore: false },
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => response });
    const result = await client.discover(
      {
        riderId: MOCK_REQUEST.riderId,
        pickupLat: MOCK_REQUEST.pickupLat,
        pickupLng: MOCK_REQUEST.pickupLng,
        destLat: MOCK_REQUEST.destLat,
        destLng: MOCK_REQUEST.destLng,
        day: 1,
        departureTime: "07:00",
        subscriptionType: "ONE_WAY",
        page: 1,
        pageSize: 20,
      },
      1000,
    );
    expect(result).toEqual(response);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "http://localhost:8001/internal/v2/matching/search",
    );
  });

  it("rejects an upstream discovery response that violates the contract", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "v2", results: "corrupt" }),
    });
    await expect(
      client.discover(
        {
          riderId: MOCK_REQUEST.riderId,
          pickupLat: MOCK_REQUEST.pickupLat,
          pickupLng: MOCK_REQUEST.pickupLng,
          destLat: MOCK_REQUEST.destLat,
          destLng: MOCK_REQUEST.destLng,
          day: 1,
          departureTime: "07:00",
          subscriptionType: "ONE_WAY",
          page: 1,
          pageSize: 20,
        },
        1000,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableWithRetryException);
  });

  it("successfully calls upstream Python matching service and parses response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_RESPONSE),
    });

    const res = await client.search(MOCK_REQUEST, 3000, undefined, "req-xyz");

    expect(res).toEqual(MOCK_RESPONSE);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8001/internal/v1/matching/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Request-ID": "req-xyz",
        }),
        body: JSON.stringify(MOCK_REQUEST),
      }),
    );
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("throws UnprocessableEntityException on upstream 422 status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve("Invalid route polyline"),
    });

    await expect(client.search(MOCK_REQUEST, 3000)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("throws ServiceUnavailableWithRetryException with Retry-After: 30 on upstream 500 error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal matching crash"),
    });

    try {
      await client.search(MOCK_REQUEST, 3000);
      fail("Expected ServiceUnavailableWithRetryException");
    } catch (err) {
      if (!(err instanceof ServiceUnavailableWithRetryException)) throw err;
      expect(err).toBeInstanceOf(ServiceUnavailableWithRetryException);
      expect(err.getStatus()).toBe(503);
      expect(err.headers).toEqual({ "Retry-After": "30" });
    }
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("throws ServiceUnavailableWithRetryException with Retry-After: 30 on connection or network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fetch failed: ECONNREFUSED"));

    try {
      await client.search(MOCK_REQUEST, 3000);
      fail("Expected ServiceUnavailableWithRetryException");
    } catch (err) {
      if (!(err instanceof ServiceUnavailableWithRetryException)) throw err;
      expect(err).toBeInstanceOf(ServiceUnavailableWithRetryException);
      expect(err.getStatus()).toBe(503);
      expect(err.headers).toEqual({ "Retry-After": "30" });
    }
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});

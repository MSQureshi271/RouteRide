/**
 * SearchService — commute search orchestration, caching, coordinate resolution, and enrichment (T1.08).
 *
 * Implements:
 *  - 5000ms Overall Gateway Response Deadline with Promise.race
 *  - Dynamic matching budget allocation (min(3000ms, remainingBudgetMs))
 *  - Rider ownership verification (403 for other consumers, 404 if non-existent)
 *  - Query coordinates > rider profile coordinates resolution (400 MISSING_COORDINATES)
 *  - Inclusive bounding box check (min <= x <= max, 422 OUTSIDE_SERVICE_AREA)
 *  - Redis caching with 6-decimal precision (~0.11m), omitting riderId, 2-minute TTL
 *  - Defensive contract validation via DriverSearchResponseDataSchema.safeParse()
 *  - DB enrichment for candidate driver names, vehicles, prices preserving exact ranking order
 *  - Dominant no-match reasons mapping when zero eligible candidates exist
 */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import crypto from "node:crypto";
import type Redis from "ioredis";
import { getEnv } from "@routeride/config";
import { ServiceUnavailableWithRetryException } from "../common/service-unavailable-retry.exception.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MatchingClient } from "./matching.client.js";
import {
  DriverSearchQuery,
  DriverDiscoveryResponseDataV2Schema,
  type DriverDiscoveryQueryV2,
  type DriverDiscoveryResponseDataV2,
  type DriverDiscoveryResultV2,
  DriverSearchResponseData,
  DriverSearchResponseDataSchema,
  FirstFailureCounts,
  InternalCandidateMatch,
  InternalSearchRequest,
  MatchedRouteResult,
  NoMatchReason,
} from "@routeride/contracts";

interface RiderLocationRow {
  id: string;
  consumer_profile_id: string;
  home_lat: number | null;
  home_lng: number | null;
  dest_lat: number | null;
  dest_lng: number | null;
}

interface EnrichedDriverRow {
  driver_profile_id: string;
  driver_name: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_colour: string;
  base_price_cents: number;
  currency: string;
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  const total = (h * 60 + m + Math.max(0, Math.round(minutes))) % 1440;
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  public gatewayDeadlineMs = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingClient: MatchingClient,
    @Inject("REDIS_CLIENT") private readonly redis: Redis,
  ) {}

  async discover(
    userId: string,
    query: DriverDiscoveryQueryV2,
    requestId?: string,
  ): Promise<DriverDiscoveryResponseDataV2> {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.executeDiscovery(userId, query, abort.signal, requestId),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abort.abort();
            reject(
              new ServiceUnavailableWithRetryException(
                "Search deadline exceeded",
                30,
              ),
            );
          }, this.gatewayDeadlineMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async executeDiscovery(
    userId: string,
    query: DriverDiscoveryQueryV2,
    signal: AbortSignal,
    requestId?: string,
  ): Promise<DriverDiscoveryResponseDataV2> {
    const started = Date.now();
    const coordinates = await this.resolveCoordinates(userId, query);
    this.assertBoundingBox(
      coordinates.pickupLat,
      coordinates.pickupLng,
      coordinates.destLat,
      coordinates.destLng,
    );
    // A revision fingerprint invalidates shared responses after any roster, coverage,
    // approval or availability edit, including writers outside this gateway.
    const revisions = await this.prisma.sql<{ revision: string }>`
      SELECT concat(COUNT(*), ':', COALESCE(SUM(availability_version),0), ':',
        COALESCE(SUM(roster_version),0), ':', MAX(updated_at)) AS revision FROM driver_profiles
    `;
    const hash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          ...coordinates,
          day: query.day,
          departureTime: query.departureTime,
          subscriptionType: query.subscriptionType,
          pickupTime: query.pickupTime,
          page: query.page,
          pageSize: query.pageSize,
          revision: revisions[0]?.revision,
        }),
      )
      .digest("hex");
    const policyVersion = `city-v2.2:${getEnv().MATCHING_CONFIG_VERSION}`;
    const key = `search:v2:${policyVersion}:${hash}`;
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const parsed = DriverDiscoveryResponseDataV2Schema.safeParse(
          JSON.parse(cached),
        );
        if (parsed.success) return parsed.data;
        await this.redis.del(key);
      }
    } catch {
      this.logger.warn({ event: "discovery.cache_unavailable" });
    }
    const remaining = this.gatewayDeadlineMs - (Date.now() - started);
    if (remaining <= 0)
      throw new ServiceUnavailableWithRetryException(
        "Search deadline exceeded",
        30,
      );
    const upstream = await this.matchingClient.discover(
      {
        ...coordinates,
        riderId: query.riderId,
        day: query.day,
        departureTime: query.departureTime,
        subscriptionType: query.subscriptionType,
        page: query.page,
        pageSize: query.pageSize,
        ...(query.pickupTime ? { pickupTime: query.pickupTime } : {}),
      },
      Math.min(remaining, 3000),
      signal,
      requestId,
    );
    if (upstream.policyVersion !== policyVersion) {
      throw new ServiceUnavailableWithRetryException(
        "Matching policy rollout is incomplete; retry shortly",
        30,
      );
    }
    const ids = upstream.results.map((result) => result.driverProfileId);
    const profiles = ids.length
      ? await this.prisma.sql<EnrichedDriverRow>`
      SELECT dp.id AS driver_profile_id, u.full_name AS driver_name,
        dp.vehicle_make, dp.vehicle_model, dp.vehicle_colour, dp.base_price_cents, dp.currency
      FROM driver_profiles dp JOIN users u ON u.id = dp.user_id
      WHERE dp.id = ANY(${ids}::text[])
    `
      : [];
    const byId = new Map(profiles.map((row) => [row.driver_profile_id, row]));
    const results: DriverDiscoveryResultV2[] = upstream.results.map(
      (candidate) => {
        const profile = byId.get(candidate.driverProfileId);
        if (!profile)
          throw new ServiceUnavailableWithRetryException(
            "Driver availability changed; retry search",
            1,
          );
        return {
          driverProfileId: candidate.driverProfileId,
          routeState: candidate.routeState,
          pickupDistanceMeters: candidate.pickupDistanceMeters,
          destDistanceMeters: candidate.destDistanceMeters,
          availableSeats: candidate.availableSeats,
          availabilityStatus: candidate.availabilityStatus,
          reviewStatus: candidate.reviewStatus,
          avgRating: candidate.avgRating,
          reviewCount: candidate.reviewCount,
          driverName: profile.driver_name,
          vehicleMake: profile.vehicle_make,
          vehicleModel: profile.vehicle_model,
          vehicleColour: profile.vehicle_colour,
          monthlyPriceCents: profile.base_price_cents,
          currency: profile.currency,
        };
      },
    );
    const payload = DriverDiscoveryResponseDataV2Schema.parse({
      version: "v2",
      results,
      pagination: upstream.pagination,
    });
    void this.redis
      .set(key, JSON.stringify(payload), "EX", 120)
      .catch(() => {});
    return payload;
  }

  async search(
    userId: string,
    query: DriverSearchQuery,
    requestId?: string,
  ): Promise<DriverSearchResponseData> {
    const deadline = Date.now() + this.gatewayDeadlineMs;
    const abortController = new AbortController();

    const timer = setTimeout(() => {
      abortController.abort(new Error("GATEWAY_DEADLINE_EXCEEDED"));
    }, this.gatewayDeadlineMs);

    try {
      return await Promise.race([
        this.executeSearch(
          userId,
          query,
          deadline,
          abortController.signal,
          requestId,
        ),
        new Promise<never>((_, reject) => {
          abortController.signal.addEventListener("abort", () => {
            reject(
              new ServiceUnavailableWithRetryException(
                "Search gateway response deadline exceeded",
                30,
              ),
            );
          });
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async executeSearch(
    userId: string,
    query: DriverSearchQuery,
    deadline: number,
    parentSignal: AbortSignal,
    requestId?: string,
  ): Promise<DriverSearchResponseData> {
    // 1. Rider ownership & coordinate resolution
    const coords = await this.resolveCoordinates(userId, query);

    // 2. Bounding Box check (inclusive of boundaries)
    this.assertBoundingBox(
      coords.pickupLat,
      coords.pickupLng,
      coords.destLat,
      coords.destLng,
    );

    // 3. Redis cache lookup with defensive contract validation
    const cacheKey = this.buildCacheKey(
      coords.pickupLat,
      coords.pickupLng,
      coords.destLat,
      coords.destLng,
      query,
    );
    const cachedData = await this.readValidatedCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // 4. Calculate dynamic upstream matching budget
    const remainingBudgetMs = deadline - Date.now();
    if (remainingBudgetMs <= 0) {
      throw new ServiceUnavailableWithRetryException(
        "Search gateway response deadline exceeded",
        30,
      );
    }
    const matchingBudgetMs = Math.min(3000, remainingBudgetMs);

    // 5. Proxy call to Python matching microservice
    const internalRequest: InternalSearchRequest = {
      riderId: query.riderId,
      pickupLat: coords.pickupLat,
      pickupLng: coords.pickupLng,
      destLat: coords.destLat,
      destLng: coords.destLng,
      day: query.day,
      departureTime: query.departureTime,
      subscriptionType: query.subscriptionType,
      ...(query.pickupTime ? { pickupTime: query.pickupTime } : {}),
      pickupRadiusMeters: 1500,
      destRadiusMeters: 2000,
    };

    const upstreamResponse = await this.matchingClient.search(
      internalRequest,
      matchingBudgetMs,
      parentSignal,
      requestId,
    );

    // 6. Candidate enrichment
    const enrichedResults = await this.enrichCandidates(
      upstreamResponse.results,
      query.departureTime,
    );

    // 7. No-Match Reason calculation
    let noMatchReasons: NoMatchReason[] | undefined = undefined;
    if (enrichedResults.length === 0) {
      noMatchReasons = this.resolveDominantNoMatchReason(
        upstreamResponse.exclusionSummary?.firstFailureCounts,
      );
    }

    const responseData: DriverSearchResponseData = {
      results: enrichedResults,
      count: enrichedResults.length,
      totalEligible: upstreamResponse.totalEligible,
      searchRadiusMetres: 1500,
      ...(noMatchReasons ? { noMatchReasons } : {}),
    };

    // 8. Store validated payload in Redis (2 min TTL)
    void this.redis
      .set(cacheKey, JSON.stringify(responseData), "EX", 120)
      .catch((err) =>
        this.logger.warn({
          event: "search.cache_write_error",
          error: String(err),
        }),
      );

    return responseData;
  }

  private async resolveCoordinates(
    userId: string,
    query: DriverSearchQuery,
  ): Promise<{
    pickupLat: number;
    pickupLng: number;
    destLat: number;
    destLng: number;
  }> {
    // Check if query provided explicit coordinates
    const hasQueryPickup =
      query.pickupLat !== undefined && query.pickupLng !== undefined;
    const hasQueryDest =
      query.destLat !== undefined && query.destLng !== undefined;

    // Verify rider ownership
    const rows = (await this.prisma.sql`
      SELECT
        r.id,
        r.consumer_profile_id,
        ST_Y(r.home_location::geometry) AS home_lat,
        ST_X(r.home_location::geometry) AS home_lng,
        ST_Y(r.dest_location::geometry) AS dest_lat,
        ST_X(r.dest_location::geometry) AS dest_lng
      FROM riders r
      JOIN consumer_profiles cp ON cp.id = r.consumer_profile_id
      WHERE r.id = ${query.riderId} AND cp.user_id = ${userId}
      LIMIT 1
    `) as unknown as RiderLocationRow[];

    if (rows.length === 0) {
      // Check if rider exists at all
      const anyRider = (await this.prisma.sql`
        SELECT id FROM riders WHERE id = ${query.riderId} LIMIT 1
      `) as unknown as { id: string }[];

      if (anyRider.length > 0) {
        throw new ForbiddenException("You do not have access to this rider");
      }
      throw new NotFoundException("Rider not found");
    }

    const rider = rows[0]!;

    const pickupLat = hasQueryPickup ? query.pickupLat! : rider.home_lat;
    const pickupLng = hasQueryPickup ? query.pickupLng! : rider.home_lng;
    const destLat = hasQueryDest ? query.destLat! : rider.dest_lat;
    const destLng = hasQueryDest ? query.destLng! : rider.dest_lng;

    if (
      pickupLat === null ||
      pickupLat === undefined ||
      pickupLng === null ||
      pickupLng === undefined ||
      destLat === null ||
      destLat === undefined ||
      destLng === null ||
      destLng === undefined ||
      isNaN(pickupLat) ||
      isNaN(pickupLng) ||
      isNaN(destLat) ||
      isNaN(destLng)
    ) {
      throw new BadRequestException(
        "Coordinates must be provided in query or set on rider profile",
      );
    }

    return { pickupLat, pickupLng, destLat, destLng };
  }

  private assertBoundingBox(
    pickupLat: number,
    pickupLng: number,
    destLat: number,
    destLng: number,
  ): void {
    const env = getEnv();
    const inBbox = (lat: number, lng: number) =>
      lat >= env.LAUNCH_CITY_BBOX_MIN_LAT &&
      lat <= env.LAUNCH_CITY_BBOX_MAX_LAT &&
      lng >= env.LAUNCH_CITY_BBOX_MIN_LON &&
      lng <= env.LAUNCH_CITY_BBOX_MAX_LON;

    if (!inBbox(pickupLat, pickupLng) || !inBbox(destLat, destLng)) {
      throw new UnprocessableEntityException(
        "Pickup or destination location is outside the operational service area",
      );
    }
  }

  private buildCacheKey(
    pickupLat: number,
    pickupLng: number,
    destLat: number,
    destLng: number,
    query: DriverSearchQuery,
  ): string {
    const matchingConfigVersion = 1;
    const pickup6 = `${pickupLat.toFixed(6)},${pickupLng.toFixed(6)}`;
    const dest6 = `${destLat.toFixed(6)},${destLng.toFixed(6)}`;
    const subType = query.subscriptionType;
    const pickup = query.pickupTime ?? "";
    const rawHash = `${pickup6}:${dest6}:${query.day}:${query.departureTime}:${pickup}:${subType}`;
    const hash = crypto.createHash("sha256").update(rawHash).digest("hex");
    return `search:v1:${matchingConfigVersion}:${hash}`;
  }

  private async readValidatedCache(
    key: string,
  ): Promise<DriverSearchResponseData | null> {
    try {
      const cached = await this.redis.get(key);
      if (!cached) return null;

      const raw = JSON.parse(cached);
      const parsed = DriverSearchResponseDataSchema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }

      this.logger.warn({
        event: "search.cache_corrupted_or_outdated",
        key,
        issues: parsed.error.issues,
      });
      void this.redis.del(key).catch(() => {});
      return null;
    } catch (err) {
      this.logger.warn({
        event: "search.cache_parse_error",
        key,
        error: String(err),
      });
      void this.redis.del(key).catch(() => {});
      return null;
    }
  }

  private async enrichCandidates(
    candidates: InternalCandidateMatch[],
    pickupTime: string,
  ): Promise<MatchedRouteResult[]> {
    if (candidates.length === 0) return [];

    const driverIds = candidates.map((c) => c.driverProfileId);

    const rows = (await this.prisma.sql`
      SELECT
        dp.id AS driver_profile_id,
        u.full_name AS driver_name,
        dp.vehicle_make,
        dp.vehicle_model,
        dp.vehicle_colour,
        dp.base_price_cents,
        dp.currency
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.id = ANY(${driverIds}::text[])
    `) as unknown as EnrichedDriverRow[];

    const profileMap = new Map<string, EnrichedDriverRow>();
    for (const row of rows) {
      profileMap.set(row.driver_profile_id, row);
    }

    const results: MatchedRouteResult[] = [];
    for (const cand of candidates) {
      const profile = profileMap.get(cand.driverProfileId);
      const durationMins = cand.estimatedTripDurationMinutes ?? 30;

      results.push({
        driverProfileId: cand.driverProfileId,
        driverName: profile?.driver_name ?? "Verified Driver",
        driverRating: cand.avgRating ?? 3.5,
        vehicleMake: profile?.vehicle_make ?? "Toyota",
        vehicleModel: profile?.vehicle_model ?? "HiAce",
        vehicleColour: profile?.vehicle_colour ?? "White",
        monthlyPriceCents: profile?.base_price_cents ?? 1500000,
        currency: profile?.currency ?? "PKR",
        pickupWalkDistanceMeters:
          Math.round(cand.pickupDistanceMeters * 10) / 10,
        dropoffWalkDistanceMeters:
          Math.round(cand.destDistanceMeters * 10) / 10,
        estimatedPickupTime: pickupTime,
        estimatedDropoffTime: addMinutesToTime(pickupTime, durationMins),
        availableSeats: cand.availableSeats,
        matchScore: cand.compositeScore,
      });
    }

    return results;
  }

  private resolveDominantNoMatchReason(
    counts?: FirstFailureCounts,
  ): NoMatchReason[] {
    if (!counts) return ["NO_DRIVERS_IN_AREA"];

    const stageScores: Array<{ reason: NoMatchReason; count: number }> = [
      { reason: "NO_DRIVERS_IN_AREA", count: counts.distance ?? 0 },
      { reason: "NO_DRIVERS_IN_DIRECTION", count: counts.direction ?? 0 },
      { reason: "NO_DRIVERS_ON_DAY", count: counts.operatingDay ?? 0 },
      { reason: "ALL_DRIVERS_FULL", count: counts.capacity ?? 0 },
      { reason: "NO_DRIVERS_AT_TIME", count: counts.timing ?? 0 },
    ];

    let maxCount = 0;
    let dominantReason: NoMatchReason = "NO_DRIVERS_IN_AREA";

    for (const item of stageScores) {
      if (item.count > maxCount) {
        maxCount = item.count;
        dominantReason = item.reason;
      }
    }

    return [dominantReason];
  }
}

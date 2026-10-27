/**
 * Duration Cache Warm-Up Job Service (Phase 1A Task 1.10c).
 *
 * Implements the daily off-peak duration cache precomputation:
 *  1. Identifies distinct origin/destination coordinate pairs from active
 *     subscriptions and registered rider profiles within Karachi bounding box.
 *  2. Computes travel durations via Google Maps Distance Matrix API (if API key available)
 *     or deterministic Haversine fallback.
 *  3. Caches calculated durations in Redis:
 *     - Key: duration:{lat1.toFixed(4)},{lng1.toFixed(4)}:{lat2.toFixed(4)},{lng2.toFixed(4)}
 *     - TTL: MATCHING_DURATION_CACHE_TTL_S (86,400s / 24 hours)
 *  4. Graceful non-blocking degradation: logs errors without failing worker process.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import Redis from "ioredis";
import { z } from "zod";
import { getEnv } from "@routeride/config";
import { WorkerDatabaseService } from "../database/database.service";

export const DEFAULT_DURATION_CACHE_TTL_S = 86400; // 24 hours

export interface RouteCoordPair {
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
}

export interface DurationCacheEntry {
  policyVersion: "search-estimate-v2";
  authoritativeForAcceptance: false;
  durationMinutes: number;
  distanceMeters: number;
  source: "GOOGLE_MAPS" | "HAVERSINE_ESTIMATE";
  computedAt: string;
}

export interface DurationWarmupResult {
  pairsWarmed: number;
  apiSuccessCount: number;
  fallbackCount: number;
}

const GoogleDistanceMatrixSchema = z.object({
  status: z.string(),
  rows: z.array(
    z.object({
      elements: z.array(
        z.object({
          status: z.string(),
          duration: z
            .object({
              value: z.number(), // seconds
              text: z.string(),
            })
            .optional(),
          distance: z
            .object({
              value: z.number(), // meters
              text: z.string(),
            })
            .optional(),
        }),
      ),
    }),
  ),
});

export function calculateHaversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000.0;
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180.0;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180.0;

  const a =
    Math.sin(deltaPhi / 2.0) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2.0) ** 2;
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return R * c;
}

export function calculateHaversineDurationMinutes(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  citySpeedKmh: number = 25.0,
  detourFactor: number = 1.3,
): number {
  const meters = calculateHaversineDistanceMeters(lat1, lng1, lat2, lng2);
  const km = meters / 1000.0;
  return ((km * detourFactor) / citySpeedKmh) * 60.0;
}

export function buildDurationCacheKey(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): string {
  return `duration:${lat1.toFixed(4)},${lng1.toFixed(4)}:${lat2.toFixed(4)},${lng2.toFixed(4)}`;
}

@Injectable()
export class DurationCacheJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DurationCacheJobService.name);
  public redisClient!: Redis;

  constructor(private readonly dbService: WorkerDatabaseService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env["REDIS_URL"] || "redis://localhost:6379";
    this.redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  async executeWarmup(): Promise<DurationWarmupResult> {
    this.logger.log({ event: "duration_cache.warmup_started" });
    const pairs = await this.fetchDistinctRoutePairs();

    let apiSuccess = 0;
    let fallbackCount = 0;
    const ttlSeconds =
      Number(process.env["MATCHING_DURATION_CACHE_TTL_S"]) ||
      DEFAULT_DURATION_CACHE_TTL_S;

    for (const pair of pairs) {
      const entry = await this.resolveDuration(pair);
      if (entry.source === "GOOGLE_MAPS") {
        apiSuccess++;
      } else {
        fallbackCount++;
      }

      const key = buildDurationCacheKey(
        pair.pickupLat,
        pair.pickupLng,
        pair.destLat,
        pair.destLng,
      );

      await this.redisClient.set(key, JSON.stringify(entry), "EX", ttlSeconds);
    }

    const result: DurationWarmupResult = {
      pairsWarmed: pairs.length,
      apiSuccessCount: apiSuccess,
      fallbackCount,
    };

    this.logger.log({
      event: "duration_cache.warmup_completed",
      ...result,
    });
    return result;
  }

  async fetchDistinctRoutePairs(): Promise<RouteCoordPair[]> {
    // Extracts distinct coordinates from active subscriptions and registered riders in BBox
    const rows = await this.dbService.query<{
      pickup_lat: number;
      pickup_lng: number;
      dest_lat: number;
      dest_lng: number;
    }>(`
      WITH candidate_pairs AS (
        -- Active subscriptions
        SELECT
          ST_Y(s.agreed_pickup_location::geometry) AS pickup_lat,
          ST_X(s.agreed_pickup_location::geometry) AS pickup_lng,
          ST_Y(s.agreed_dropoff_location::geometry) AS dest_lat,
          ST_X(s.agreed_dropoff_location::geometry) AS dest_lng
        FROM subscriptions s
        WHERE s.status = 'ACTIVE'
          AND s.agreed_pickup_location IS NOT NULL
          AND s.agreed_dropoff_location IS NOT NULL

        UNION

        -- Registered riders
        SELECT
          ST_Y(r.home_location::geometry) AS pickup_lat,
          ST_X(r.home_location::geometry) AS pickup_lng,
          ST_Y(r.dest_location::geometry) AS dest_lat,
          ST_X(r.dest_location::geometry) AS dest_lng
        FROM riders r
        WHERE r.home_location IS NOT NULL
          AND r.dest_location IS NOT NULL
      )
      SELECT DISTINCT
        ROUND(pickup_lat::numeric, 4)::float8 AS pickup_lat,
        ROUND(pickup_lng::numeric, 4)::float8 AS pickup_lng,
        ROUND(dest_lat::numeric, 4)::float8 AS dest_lat,
        ROUND(dest_lng::numeric, 4)::float8 AS dest_lng
      FROM candidate_pairs
      WHERE pickup_lat BETWEEN 24.7000 AND 25.1500
        AND pickup_lng BETWEEN 66.8500 AND 67.3500
        AND dest_lat BETWEEN 24.7000 AND 25.1500
        AND dest_lng BETWEEN 66.8500 AND 67.3500
      LIMIT 500;
    `);

    return rows.map((r) => ({
      pickupLat: r.pickup_lat,
      pickupLng: r.pickup_lng,
      destLat: r.dest_lat,
      destLng: r.dest_lng,
    }));
  }

  async resolveDuration(pair: RouteCoordPair): Promise<DurationCacheEntry> {
    let apiKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!apiKey) {
      try {
        apiKey = getEnv().GOOGLE_MAPS_API_KEY;
      } catch {
        apiKey = undefined;
      }
    }

    if (apiKey && apiKey !== "REPLACE_ME") {
      try {
        const url = new URL(
          "https://maps.googleapis.com/maps/api/distancematrix/json",
        );
        url.searchParams.set("origins", `${pair.pickupLat},${pair.pickupLng}`);
        url.searchParams.set("destinations", `${pair.destLat},${pair.destLng}`);
        url.searchParams.set("mode", "driving");
        url.searchParams.set("key", apiKey);

        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const json = await response.json();
          const parsed = GoogleDistanceMatrixSchema.safeParse(json);
          if (
            parsed.success &&
            parsed.data.status === "OK" &&
            parsed.data.rows[0]?.elements[0]?.status === "OK"
          ) {
            const element = parsed.data.rows[0].elements[0];
            const sec = element.duration?.value ?? 0;
            const meters = element.distance?.value ?? 0;
            return {
              durationMinutes: Math.round((sec / 60.0) * 10) / 10,
              distanceMeters: meters,
              source: "GOOGLE_MAPS",
              policyVersion: "search-estimate-v2",
              authoritativeForAcceptance: false,
              computedAt: new Date().toISOString(),
            };
          }
        }
      } catch {
        this.logger.warn({
          event: "duration_cache.maps_api_error",
          reason: "provider_failure",
        });
      }
    }

    // Deterministic Haversine Fallback
    const haversineMins = calculateHaversineDurationMinutes(
      pair.pickupLat,
      pair.pickupLng,
      pair.destLat,
      pair.destLng,
    );
    const haversineMeters = calculateHaversineDistanceMeters(
      pair.pickupLat,
      pair.pickupLng,
      pair.destLat,
      pair.destLng,
    );

    return {
      durationMinutes: Math.round(haversineMins * 10) / 10,
      distanceMeters: Math.round(haversineMeters),
      source: "HAVERSINE_ESTIMATE",
      policyVersion: "search-estimate-v2",
      authoritativeForAcceptance: false,
      computedAt: new Date().toISOString(),
    };
  }
}

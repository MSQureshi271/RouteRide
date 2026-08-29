/**
 * Health controller — GET /health
 *
 * Performs real liveness checks:
 *  - PostgreSQL: SELECT 1 with a 2-second timeout
 *  - Redis: PING with a 2-second timeout
 *
 * Returns:
 *  - 200 { status: "ok", db: "ok", redis: "ok" }         — all healthy
 *  - 503 { status: "degraded", db: "down"|"ok", ... }    — any failure
 *
 * The check is intentionally NOT wrapped by the ResponseInterceptor envelope
 * (health probes are consumed by infra, not clients).
 *
 * Source (Terminus custom health indicator):
 *   https://docs.nestjs.com/recipes/terminus#creating-a-custom-health-indicator
 */
import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from "@nestjs/terminus";
import { getEnv } from "@routeride/config";
import Redis from "ioredis";
import { db } from "../prisma/db";

const TIMEOUT_MS = 2000;

/** One-shot Redis client used only by the health check. */
let _redisForHealth: Redis | null = null;
function getRedisForHealth(): Redis {
  if (!_redisForHealth) {
    const env = getEnv();
    _redisForHealth = new Redis(env.REDIS_URL, {
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: TIMEOUT_MS,
    });
  }
  return _redisForHealth;
}

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      // ─── DB check ───────────────────────────────────────────────────────
      async () => {
        try {
          await Promise.race([
            db.connect(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("DB health check timed out")),
                TIMEOUT_MS,
              ),
            ),
          ]);
          return { db: { status: "up" } };
        } catch {
          return { db: { status: "down" } };
        }
      },

      // ─── Redis check ─────────────────────────────────────────────────────
      async () => {
        try {
          const redis = getRedisForHealth();
          await Promise.race([
            redis.ping(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Redis health check timed out")),
                TIMEOUT_MS,
              ),
            ),
          ]);
          return { redis: { status: "up" } };
        } catch {
          return { redis: { status: "down" } };
        }
      },
    ]);
  }
}

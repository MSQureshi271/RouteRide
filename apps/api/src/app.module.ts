/**
 * Root AppModule.
 *
 * Configures:
 *  - LoggerModule (nestjs-pino, structured JSON with redaction)
 *  - ThrottlerModule (Redis-backed rate limiting, 4 strategies)
 *  - HealthModule  (GET /health)
 *  - MetricsModule (GET /metrics)
 *  - RequestIdMiddleware (global)
 */
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { LoggerModule } from "nestjs-pino";
import { getEnv } from "@routeride/config";

import type { IncomingMessage } from "node:http";
import { HealthModule } from "./health/health.module.js";
import { MetricsModule } from "./metrics/metrics.module.js";
import { RequestIdMiddleware } from "./common/request-id.middleware.js";
import { GeneralRateLimitGuard } from "./common/rate-limit.js";

@Module({
  imports: [
    // ─── Logging ────────────────────────────────────────────────────────────
    LoggerModule.forRoot({
      pinoHttp: {
        // Never log request bodies (PII risk)
        serializers: {
          req(req: { method: string; url: string; id: string }) {
            return { method: req.method, url: req.url, id: req.id };
          },
        },
        customProps: (req: IncomingMessage) => ({
          requestId:
            (req as IncomingMessage & { requestId?: string }).requestId ??
            "unknown",
          service: "routeride-api",
        }),
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "*.password",
            "*.passwordHash",
            "*.token",
            "*.tokenHash",
            "*.otp",
            "*.secret",
            "*.cardNumber",
            "*.stripeSecretKey",
            "*.fcmToken",
          ],
          censor: "[REDACTED]",
        },
        autoLogging: {
          ignore: (req: IncomingMessage) => req.url === "/health",
        },
      },
    }),

    // ─── Rate Limiting (Redis-backed) ────────────────────────────────────────
    ThrottlerModule.forRoot({
      throttlers: [
        // General limit — applied globally via GeneralRateLimitGuard
        { name: "general", ttl: 60_000, limit: 200 },
        // Auth limit — applied via AuthRateLimitGuard on /auth/* endpoints
        { name: "auth", ttl: 600_000, limit: 5 },
        // OTP limit — applied via OtpRateLimitGuard on /auth/otp/verify
        { name: "otp", ttl: 300_000, limit: 3 },
        // Search limit — applied via SearchRateLimitGuard on /search
        { name: "search", ttl: 60_000, limit: 30 },
      ],
      storage: new ThrottlerStorageRedisService(getEnv().REDIS_URL),
    }),

    HealthModule,
    MetricsModule,
  ],
  providers: [
    // Global rate limit guard — applied to every request
    {
      provide: APP_GUARD,
      useClass: GeneralRateLimitGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply RequestIdMiddleware to every route
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}

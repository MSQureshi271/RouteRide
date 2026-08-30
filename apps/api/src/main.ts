/**
 * Application bootstrap.
 *
 * Import order is critical:
 *  1. ./instrument    — Sentry must be initialised before ANY other module
 *  2. @routeride/config/tracing — OTel SDK must patch before NestFactory
 *  3. loadEnv()      — validate env vars before any other import that needs config
 *  4. NestFactory    — create the app
 *
 * Source (NestJS Fastify):
 *   https://docs.nestjs.com/techniques/performance#adapter
 * Source (Sentry NestJS):
 *   https://docs.sentry.io/platforms/javascript/guides/nestjs/
 */

// ── 1. Sentry — must be absolute first ──────────────────────────────────────
import "./instrument.js";

// ── 2. OTel — must patch before NestFactory ──────────────────────────────────
// (tracing.ts exports nothing; it is imported for its side-effects)
import "@routeride/config/tracing";

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── 3. Environment ────────────────────────────────────────────────────────────
import { loadEnv } from "@routeride/config";
const env = loadEnv();

// ── 4. NestJS + Fastify ───────────────────────────────────────────────────────
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";

// ── 5. App wiring ─────────────────────────────────────────────────────────────
import { AppModule } from "./app.module.js";
import { ResponseInterceptor } from "./common/response.interceptor.js";
import { ErrorFilter } from "./common/error.filter.js";
import { MetricsInterceptor } from "./common/metrics.js";

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({ logger: false }); // Pino is handled by nestjs-pino

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    {
      bufferLogs: true, // collect logs until nestjs-pino takes over
    },
  );

  // ── Pino logger ─────────────────────────────────────────────────────────────
  app.useLogger(app.get(Logger));

  // ── Security: @fastify/helmet ────────────────────────────────────────────────
  // Source: https://github.com/fastify/fastify-helmet
  await app.register(
    (await import("@fastify/helmet")).default as unknown as Parameters<
      typeof app.register
    >[0],
    {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:", "validator.swagger.io"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: "same-origin" },
      frameguard: { action: "deny" },
    },
  );

  // ── Swagger / OpenAPI UI ─────────────────────────────────────────────────────
  let openapiSpec: Record<string, unknown> = {};
  const possiblePaths = [
    resolve(process.cwd(), "../../packages/contracts/openapi.json"),
    resolve(process.cwd(), "../contracts/openapi.json"),
    resolve(process.cwd(), "node_modules/@routeride/contracts/openapi.json"),
  ];
  for (const candidate of possiblePaths) {
    if (existsSync(candidate)) {
      try {
        openapiSpec = JSON.parse(readFileSync(candidate, "utf-8")) as Record<
          string,
          unknown
        >;
        break;
      } catch {
        // continue to next candidate
      }
    }
  }

  await app.register(
    (await import("@fastify/swagger")).default as unknown as Parameters<
      typeof app.register
    >[0],
    {
      mode: "static",
      specification: {
        document: openapiSpec,
      },
    },
  );

  await app.register(
    (await import("@fastify/swagger-ui")).default as unknown as Parameters<
      typeof app.register
    >[0],
    {
      routePrefix: "/docs",
      uiConfig: {
        docExpansion: "list",
        deepLinking: true,
      },
      staticCSP: true,
      transformStaticCSP: (header: string) => header,
    },
  );

  // ── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(",").map((o: string) =>
    o.trim(),
  );
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID"],
  });

  // ── Global interceptors ────────────────────────────────────────────────────
  app.useGlobalInterceptors(
    new MetricsInterceptor(),
    new ResponseInterceptor(),
  );

  // ── Global exception filter ───────────────────────────────────────────────
  app.useGlobalFilters(new ErrorFilter());

  // ── API prefix ────────────────────────────────────────────────────────────
  app.setGlobalPrefix("api/v1", {
    exclude: ["health", "metrics", "docs", "docs/(.*)"],
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  const host = "0.0.0.0";
  await app.listen(env.PORT, host);
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(`\n❌ Bootstrap failed: ${String(err)}\n`);
  process.exit(1);
});

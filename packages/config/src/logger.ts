/**
 * Pino structured logger factory.
 *
 * Rules:
 *  - JSON output only (no pretty-print in production)
 *  - `service` field bound at creation time
 *  - Redaction: authorization, cookie, password, token, otp, secret, cardNumber
 *  - Coordinate serializer: rounds lat/lng/latitude/longitude to 2 decimal places
 *  - Never logs full request bodies
 *
 * Usage:
 *   const logger = createLogger('routeride-api');
 *   logger.info({ event: 'user.login', userId }, 'User logged in');
 *
 * getPinoHttpConfig() returns the pinoHttp configuration object for nestjs-pino.
 *
 * Source: https://getpino.io/#/docs/redaction
 * Source: https://github.com/iamolegga/nestjs-pino
 */
import pino, { type Logger, type LoggerOptions } from "pino";
import { getEnv } from "./env.js";

// ─── Coordinate Sanitiser ─────────────────────────────────────────────────────

const COORD_KEYS = new Set(["lat", "lng", "latitude", "longitude"]);

function roundCoord(value: unknown): unknown {
  if (typeof value !== "number") return value;
  return Math.round(value * 100) / 100;
}

/** Recursively round all coordinate fields to 2 dp in a log object. */
function sanitiseCoordinates(obj: unknown, depth = 0): unknown {
  if (depth > 8 || obj === null || typeof obj !== "object") return obj;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = COORD_KEYS.has(key)
      ? roundCoord(val)
      : sanitiseCoordinates(val, depth + 1);
  }
  return result;
}

// ─── Base Logger Options ──────────────────────────────────────────────────────

function buildLoggerOptions(service: string): LoggerOptions {
  const env = getEnv();
  return {
    level: env.LOG_LEVEL,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      log(object: Record<string, unknown>) {
        return sanitiseCoordinates(object) as Record<string, unknown>;
      },
    },
    redact: {
      paths: [
        "password",
        "passwordHash",
        "token",
        "tokenHash",
        "otp",
        "secret",
        "cardNumber",
        "authorization",
        "cookie",
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.passwordHash",
        "*.token",
        "*.tokenHash",
        "*.otp",
        "*.secret",
        "*.cardNumber",
        "*.fcmToken",
        "*.stripeSecretKey",
      ],
      censor: "[REDACTED]",
    },
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a Pino logger bound to the given service name.
 * Call once per service (e.g. at module load).
 */
export function createLogger(service: string): Logger {
  return pino(buildLoggerOptions(service));
}

// ─── nestjs-pino configuration ────────────────────────────────────────────────

/**
 * Returns the pinoHttp configuration object for use in nestjs-pino's
 * LoggerModule.forRoot({ pinoHttp: getPinoHttpConfig() }).
 *
 * Source: https://github.com/iamolegga/nestjs-pino#readme
 */
export function getPinoHttpConfig(
  service = "routeride-api",
): Record<string, unknown> {
  const env = getEnv();
  return {
    ...buildLoggerOptions(service),
    // Never log the full request or response body
    serializers: {
      req(req: { method: string; url: string; id: unknown }) {
        return { method: req.method, url: req.url, id: req.id };
      },
      res(res: { statusCode: number }) {
        return { statusCode: res.statusCode };
      },
    },
    customProps: (req: Record<string, unknown>) => ({
      requestId: req["requestId"] ?? "unknown",
      service,
    }),
    autoLogging: {
      // Skip noisy health-check pings from logs
      ignore: (req: { url?: string }) =>
        req.url === "/health" || req.url === "/metrics",
    },
    level: env.LOG_LEVEL,
  };
}

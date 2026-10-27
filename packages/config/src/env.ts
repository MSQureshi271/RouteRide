/**
 * Zod-validated environment configuration loader.
 *
 * Rules:
 *  - Call `loadEnv()` once at process start (before any other module).
 *  - Missing required variables throw immediately with a readable message.
 *  - `CORS_ALLOWED_ORIGINS` rejects `*` when `NODE_ENV=production`.
 *  - Money values (DRIVER_PRICE_*) are stored as integers (paisas).
 *  - No real value appears in .env.example — see the file for placeholder docs.
 */

import { z } from "zod";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import dotenv from "dotenv";

// ─── Dotenv Auto-Discovery ───────────────────────────────────────────────────

function loadDotenvFiles(): void {
  // In automated test runners, avoid polluting mocked/isolated test environments
  if (
    process.env["JEST_WORKER_ID"] !== undefined ||
    process.env["VITEST"] !== undefined ||
    process.env["NODE_ENV"] === "test"
  ) {
    return;
  }

  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const positiveInt = z
  .string()
  .regex(/^\d+$/, "Must be a positive integer string")
  .transform(Number);

const nonEmptyString = z.string().min(1, "Must not be empty");

const corsOrigins = z
  .string()
  .min(1)
  .refine(
    (val) => {
      if (process.env["NODE_ENV"] === "production" && val.trim() === "*") {
        return false;
      }
      return true;
    },
    { message: 'CORS_ALLOWED_ORIGINS cannot be "*" in production' },
  );

// ─── Schema ───────────────────────────────────────────────────────────────────

const EnvSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: positiveInt.default("3000"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Database
  DATABASE_URL: nonEmptyString,

  // Redis
  REDIS_URL: nonEmptyString,

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL_SECONDS: positiveInt.default("900"),
  JWT_REFRESH_TTL_SECONDS: positiveInt.default("2592000"),

  // Stripe
  STRIPE_SECRET_KEY: nonEmptyString,
  STRIPE_PUBLISHABLE_KEY: nonEmptyString,
  STRIPE_WEBHOOK_SECRET: nonEmptyString,

  // AWS / S3
  AWS_REGION: nonEmptyString,
  AWS_ENDPOINT_URL: z.string().optional(),
  S3_DOCUMENTS_BUCKET: nonEmptyString,

  // Firebase
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  // Matching service
  MATCHING_SERVICE_URL: z
    .string()
    .url("MATCHING_SERVICE_URL must be a valid URL"),
  MATCHING_SERVICE_TIMEOUT_MS: positiveInt.default("5000"),
  MATCHING_CONFIG_VERSION: z.string().min(1).max(64).default("2"),
  // Authoritative road evidence is independent of display-only duration caches.
  MATCHING_ROAD_TIMES_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MATCHING_ROAD_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3600)
    .default(300),
  MATCHING_ROAD_TRAVEL_MULTIPLIER: z.coerce.number().min(1).max(3).default(1.2),
  MATCHING_ROAD_STOP_SERVICE_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(600)
    .default(60),
  MATCHING_ROAD_TIMEOUT_SECONDS: z.coerce.number().min(0.1).max(30).default(5),

  // CORS
  CORS_ALLOWED_ORIGINS: corsOrigins,

  // Rate limiting
  RATE_LIMIT_AUTH_MAX: positiveInt.default("5"),
  RATE_LIMIT_AUTH_WINDOW_MS: positiveInt.default("600000"),
  RATE_LIMIT_OTP_MAX: positiveInt.default("3"),
  RATE_LIMIT_OTP_WINDOW_MS: positiveInt.default("300000"),
  RATE_LIMIT_SEARCH_MAX: positiveInt.default("30"),
  RATE_LIMIT_SEARCH_WINDOW_MS: positiveInt.default("60000"),

  // Platform parameters (docs/platform-parameters.md)
  LAUNCH_CITY_NAME: nonEmptyString,
  LAUNCH_CITY_TIMEZONE: nonEmptyString,
  ROUTE_SERVICE_BBOX: z.string().optional(),
  LAUNCH_CITY_BBOX_MIN_LAT: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .optional(),
  LAUNCH_CITY_BBOX_MAX_LAT: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .optional(),
  LAUNCH_CITY_BBOX_MIN_LON: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .optional(),
  LAUNCH_CITY_BBOX_MAX_LON: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .optional(),
  DEFAULT_CURRENCY: z
    .string()
    .length(3, "DEFAULT_CURRENCY must be a 3-letter ISO 4217 code"),
  STRIPE_ACCOUNT_COUNTRY: z
    .string()
    .length(2, "STRIPE_ACCOUNT_COUNTRY must be a 2-letter ISO code"),
  DRIVER_PRICE_MIN_CENTS: positiveInt,
  DRIVER_PRICE_MAX_CENTS: positiveInt,
  REQUIRED_DRIVER_DOCUMENTS: nonEmptyString,

  // Sentry
  SENTRY_DSN: z.string().url("SENTRY_DSN must be a valid URL").optional(),

  // Google Maps
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Google OAuth (server-side ID token verification)
  GOOGLE_CLIENT_ID: z.string().optional(),

  // Twilio (SMS) — optional; ConsoleSmsAdapter is used when absent
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_FROM: z.string().optional(),
});

// ─── Refinements ──────────────────────────────────────────────────────────────

const RefinedEnvSchema = EnvSchema.superRefine((data, ctx) => {
  if (data.DRIVER_PRICE_MAX_CENTS <= data.DRIVER_PRICE_MIN_CENTS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DRIVER_PRICE_MAX_CENTS"],
      message:
        "DRIVER_PRICE_MAX_CENTS must be greater than DRIVER_PRICE_MIN_CENTS",
    });
  }

  // Canonical Bounding Box resolution and fail-fast check (AD-6)
  let aliasBox:
    | { minLon: number; minLat: number; maxLon: number; maxLat: number }
    | undefined;
  if (data.ROUTE_SERVICE_BBOX) {
    const parts = data.ROUTE_SERVICE_BBOX.split(",").map((p) => p.trim());
    if (parts.length !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ROUTE_SERVICE_BBOX"],
        message:
          "ROUTE_SERVICE_BBOX must contain exactly 4 comma-separated numbers (minLon,minLat,maxLon,maxLat)",
      });
    } else {
      const [minLonStr, minLatStr, maxLonStr, maxLatStr] = parts as [
        string,
        string,
        string,
        string,
      ];
      const minLon = Number(minLonStr);
      const minLat = Number(minLatStr);
      const maxLon = Number(maxLonStr);
      const maxLat = Number(maxLatStr);
      if (isNaN(minLon) || isNaN(minLat) || isNaN(maxLon) || isNaN(maxLat)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ROUTE_SERVICE_BBOX"],
          message: "ROUTE_SERVICE_BBOX coordinates must be valid numbers",
        });
      } else {
        aliasBox = { minLon, minLat, maxLon, maxLat };
      }
    }
  }

  const hasAnyInd =
    data.LAUNCH_CITY_BBOX_MIN_LAT !== undefined ||
    data.LAUNCH_CITY_BBOX_MAX_LAT !== undefined ||
    data.LAUNCH_CITY_BBOX_MIN_LON !== undefined ||
    data.LAUNCH_CITY_BBOX_MAX_LON !== undefined;

  let indBox:
    | { minLon: number; minLat: number; maxLon: number; maxLat: number }
    | undefined;
  if (hasAnyInd) {
    if (
      data.LAUNCH_CITY_BBOX_MIN_LAT === undefined ||
      data.LAUNCH_CITY_BBOX_MAX_LAT === undefined ||
      data.LAUNCH_CITY_BBOX_MIN_LON === undefined ||
      data.LAUNCH_CITY_BBOX_MAX_LON === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["LAUNCH_CITY_BBOX_MIN_LAT"],
        message:
          "All four LAUNCH_CITY_BBOX_* variables (MIN_LAT, MAX_LAT, MIN_LON, MAX_LON) must be set together",
      });
    } else {
      indBox = {
        minLon: data.LAUNCH_CITY_BBOX_MIN_LON,
        minLat: data.LAUNCH_CITY_BBOX_MIN_LAT,
        maxLon: data.LAUNCH_CITY_BBOX_MAX_LON,
        maxLat: data.LAUNCH_CITY_BBOX_MAX_LAT,
      };
    }
  }

  if (aliasBox && indBox) {
    const tolerance = 0.0001;
    if (
      Math.abs(aliasBox.minLon - indBox.minLon) > tolerance ||
      Math.abs(aliasBox.minLat - indBox.minLat) > tolerance ||
      Math.abs(aliasBox.maxLon - indBox.maxLon) > tolerance ||
      Math.abs(aliasBox.maxLat - indBox.maxLat) > tolerance
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ROUTE_SERVICE_BBOX"],
        message:
          "Startup fail-fast: ROUTE_SERVICE_BBOX and LAUNCH_CITY_BBOX_* describe different bounding boxes (> 0.0001 deg difference)",
      });
    }
  }

  const resolved = aliasBox ??
    indBox ?? {
      minLon: 66.85,
      minLat: 24.7,
      maxLon: 67.35,
      maxLat: 25.15,
    };

  if (
    resolved.minLat < -90 ||
    resolved.minLat > 90 ||
    resolved.maxLat < -90 ||
    resolved.maxLat > 90
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LAUNCH_CITY_BBOX_MIN_LAT"],
      message: "Latitude must be between -90 and 90",
    });
  }
  if (
    resolved.minLon < -180 ||
    resolved.minLon > 180 ||
    resolved.maxLon < -180 ||
    resolved.maxLon > 180
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LAUNCH_CITY_BBOX_MIN_LON"],
      message: "Longitude must be between -180 and 180",
    });
  }
  if (resolved.minLat >= resolved.maxLat) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LAUNCH_CITY_BBOX_MAX_LAT"],
      message:
        "LAUNCH_CITY_BBOX_MAX_LAT must be greater than LAUNCH_CITY_BBOX_MIN_LAT",
    });
  }
  if (resolved.minLon >= resolved.maxLon) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LAUNCH_CITY_BBOX_MAX_LON"],
      message:
        "LAUNCH_CITY_BBOX_MAX_LON must be greater than LAUNCH_CITY_BBOX_MIN_LON",
    });
  }

  // Populate resolved values so downstreams have non-undefined fields
  (data as Record<string, unknown>)["LAUNCH_CITY_BBOX_MIN_LON"] =
    resolved.minLon;
  (data as Record<string, unknown>)["LAUNCH_CITY_BBOX_MIN_LAT"] =
    resolved.minLat;
  (data as Record<string, unknown>)["LAUNCH_CITY_BBOX_MAX_LON"] =
    resolved.maxLon;
  (data as Record<string, unknown>)["LAUNCH_CITY_BBOX_MAX_LAT"] =
    resolved.maxLat;
  (data as Record<string, unknown>)["ROUTE_SERVICE_BBOX"] =
    `${resolved.minLon},${resolved.minLat},${resolved.maxLon},${resolved.maxLat}`;
}).transform((data) => ({
  ...data,
  LAUNCH_CITY_BBOX_MIN_LON: data.LAUNCH_CITY_BBOX_MIN_LON as number,
  LAUNCH_CITY_BBOX_MIN_LAT: data.LAUNCH_CITY_BBOX_MIN_LAT as number,
  LAUNCH_CITY_BBOX_MAX_LON: data.LAUNCH_CITY_BBOX_MAX_LON as number,
  LAUNCH_CITY_BBOX_MAX_LAT: data.LAUNCH_CITY_BBOX_MAX_LAT as number,
  ROUTE_SERVICE_BBOX: data.ROUTE_SERVICE_BBOX as string,
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type Env = z.infer<typeof RefinedEnvSchema>;

// ─── Loader ───────────────────────────────────────────────────────────────────

let _env: Env | undefined;

/**
 * Parse and validate process.env. Exits non-zero on failure.
 * Call exactly once at the top of main.ts before any other import that needs config.
 */
export function loadEnv(): Env {
  if (_env) return _env;

  loadDotenvFiles();

  const result = RefinedEnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    // Use process.stderr directly to avoid circular dep with logger
    process.stderr.write(
      `\n❌  Environment validation failed — fix these before starting:\n\n${issues}\n\n`,
    );
    process.exit(1);
  }

  _env = result.data;
  return _env;
}

/**
 * Return the already-parsed env. Throws if loadEnv() was not called first.
 * Use this everywhere except main.ts.
 */
export function getEnv(): Env {
  if (!_env) {
    throw new Error(
      "getEnv() called before loadEnv(). Call loadEnv() at the top of main.ts.",
    );
  }
  return _env;
}

/** Reset the singleton (test use only). */
export function _resetEnvForTesting(): void {
  _env = undefined;
}

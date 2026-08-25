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

import { z } from 'zod';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const positiveInt = z
  .string()
  .regex(/^\d+$/, 'Must be a positive integer string')
  .transform(Number);

const nonEmptyString = z.string().min(1, 'Must not be empty');

const corsOrigins = z
  .string()
  .min(1)
  .refine(
    (val) => {
      if (process.env['NODE_ENV'] === 'production' && val.trim() === '*') {
        return false;
      }
      return true;
    },
    { message: 'CORS_ALLOWED_ORIGINS cannot be "*" in production' },
  );

// ─── Schema ───────────────────────────────────────────────────────────────────

const EnvSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positiveInt.default('3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: nonEmptyString,

  // Redis
  REDIS_URL: nonEmptyString,

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: positiveInt.default('900'),
  JWT_REFRESH_TTL_SECONDS: positiveInt.default('2592000'),

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
  MATCHING_SERVICE_URL: z.string().url('MATCHING_SERVICE_URL must be a valid URL'),
  MATCHING_SERVICE_TIMEOUT_MS: positiveInt.default('5000'),

  // CORS
  CORS_ALLOWED_ORIGINS: corsOrigins,

  // Rate limiting
  RATE_LIMIT_AUTH_MAX: positiveInt.default('5'),
  RATE_LIMIT_AUTH_WINDOW_MS: positiveInt.default('600000'),
  RATE_LIMIT_OTP_MAX: positiveInt.default('3'),
  RATE_LIMIT_OTP_WINDOW_MS: positiveInt.default('300000'),
  RATE_LIMIT_SEARCH_MAX: positiveInt.default('30'),
  RATE_LIMIT_SEARCH_WINDOW_MS: positiveInt.default('60000'),

  // Platform parameters (docs/platform-parameters.md)
  LAUNCH_CITY_NAME: nonEmptyString,
  LAUNCH_CITY_TIMEZONE: nonEmptyString,
  LAUNCH_CITY_BBOX_MIN_LAT: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number),
  LAUNCH_CITY_BBOX_MAX_LAT: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number),
  LAUNCH_CITY_BBOX_MIN_LON: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number),
  LAUNCH_CITY_BBOX_MAX_LON: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number),
  DEFAULT_CURRENCY: z.string().length(3, 'DEFAULT_CURRENCY must be a 3-letter ISO 4217 code'),
  STRIPE_ACCOUNT_COUNTRY: z.string().length(2, 'STRIPE_ACCOUNT_COUNTRY must be a 2-letter ISO code'),
  DRIVER_PRICE_MIN_CENTS: positiveInt,
  DRIVER_PRICE_MAX_CENTS: positiveInt,
  REQUIRED_DRIVER_DOCUMENTS: nonEmptyString,

  // Sentry
  SENTRY_DSN: z.string().url('SENTRY_DSN must be a valid URL').optional(),

  // Google Maps
  GOOGLE_MAPS_API_KEY: z.string().optional(),
});

// ─── Refinements ──────────────────────────────────────────────────────────────

const RefinedEnvSchema = EnvSchema.superRefine((data, ctx) => {
  if (data.DRIVER_PRICE_MAX_CENTS <= data.DRIVER_PRICE_MIN_CENTS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DRIVER_PRICE_MAX_CENTS'],
      message: 'DRIVER_PRICE_MAX_CENTS must be greater than DRIVER_PRICE_MIN_CENTS',
    });
  }

  if (data.LAUNCH_CITY_BBOX_MAX_LAT <= data.LAUNCH_CITY_BBOX_MIN_LAT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['LAUNCH_CITY_BBOX_MAX_LAT'],
      message: 'LAUNCH_CITY_BBOX_MAX_LAT must be greater than LAUNCH_CITY_BBOX_MIN_LAT',
    });
  }

  if (data.LAUNCH_CITY_BBOX_MAX_LON <= data.LAUNCH_CITY_BBOX_MIN_LON) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['LAUNCH_CITY_BBOX_MAX_LON'],
      message: 'LAUNCH_CITY_BBOX_MAX_LON must be greater than LAUNCH_CITY_BBOX_MIN_LON',
    });
  }
});

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

  const result = RefinedEnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

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
      'getEnv() called before loadEnv(). Call loadEnv() at the top of main.ts.',
    );
  }
  return _env;
}

/** Reset the singleton (test use only). */
export function _resetEnvForTesting(): void {
  _env = undefined;
}

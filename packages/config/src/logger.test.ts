// Jest globals for logger test
import { createLogger, getPinoHttpConfig } from "./logger.js";
import { loadEnv, _resetEnvForTesting } from "./env.js";

describe("Logger Configuration & Redaction", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    _resetEnvForTesting();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "jwt_mock_key_with_at_least_32_chars_ok",
      STRIPE_SECRET_KEY: "test_stripe_secret_key",
      STRIPE_PUBLISHABLE_KEY: "test_stripe_pub_key",
      STRIPE_WEBHOOK_SECRET: "test_stripe_webhook_secret",
      AWS_REGION: "us-east-1",
      S3_DOCUMENTS_BUCKET: "docs",
      MATCHING_SERVICE_URL: "http://localhost:8000",
      CORS_ALLOWED_ORIGINS: "http://localhost:3000",
      LAUNCH_CITY_NAME: "Karachi",
      LAUNCH_CITY_TIMEZONE: "Asia/Karachi",
      LAUNCH_CITY_BBOX_MIN_LAT: "24.75",
      LAUNCH_CITY_BBOX_MAX_LAT: "25.05",
      LAUNCH_CITY_BBOX_MIN_LON: "66.85",
      LAUNCH_CITY_BBOX_MAX_LON: "67.35",
      DEFAULT_CURRENCY: "PKR",
      STRIPE_ACCOUNT_COUNTRY: "PK",
      DRIVER_PRICE_MIN_CENTS: "5000",
      DRIVER_PRICE_MAX_CENTS: "50000",
      REQUIRED_DRIVER_DOCUMENTS: "CNIC,LICENCE",
    };
    loadEnv();
  });

  afterEach(() => {
    process.env = originalEnv;
    _resetEnvForTesting();
  });

  it("creates a logger with bound service name", () => {
    const logger = createLogger("test-service");
    expect(logger).toBeDefined();
    expect(logger.bindings()["service"]).toBe("test-service");
  });

  it("provides valid pinoHttp config with redaction paths and ignore rules", () => {
    const config = getPinoHttpConfig("routeride-api");
    expect(config).toBeDefined();
    expect(config["base"]).toEqual({ service: "routeride-api" });

    // Test ignore rule for health endpoint
    const autoLogging = config["autoLogging"] as {
      ignore: (req: { url: string }) => boolean;
    };
    expect(autoLogging.ignore({ url: "/health" })).toBe(true);
    expect(autoLogging.ignore({ url: "/metrics" })).toBe(true);
    expect(autoLogging.ignore({ url: "/api/v1/auth/login" })).toBe(false);
  });
});

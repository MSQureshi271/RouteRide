/**
 * Unit tests for the Zod-validated environment loader.
 *
 * Acceptance criteria (T0.07):
 *  - Booting without DATABASE_URL fails immediately with a readable message naming the variable.
 *  - CORS_ALLOWED_ORIGINS rejects "*" when NODE_ENV=production.
 *  - No real value appears in .env.example.
 *  - DRIVER_PRICE_MAX_CENTS > DRIVER_PRICE_MIN_CENTS is enforced.
 */

import { _resetEnvForTesting, loadEnv } from "./env.js";

// Minimal valid env that passes all required checks.
const baseEnv: Record<string, string> = {
  NODE_ENV: "development",
  PORT: "3000",
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a".repeat(64),
  JWT_ACCESS_TTL_SECONDS: "900",
  JWT_REFRESH_TTL_SECONDS: "2592000",
  STRIPE_SECRET_KEY: "test_stripe_secret_key",
  STRIPE_PUBLISHABLE_KEY: "test_stripe_pub_key",
  STRIPE_WEBHOOK_SECRET: "test_stripe_webhook_secret",
  AWS_REGION: "ap-south-1",
  S3_DOCUMENTS_BUCKET: "test-bucket",
  MATCHING_SERVICE_URL: "http://localhost:8000",
  CORS_ALLOWED_ORIGINS: "http://localhost:3001",
  LAUNCH_CITY_NAME: "Karachi",
  LAUNCH_CITY_TIMEZONE: "Asia/Karachi",
  LAUNCH_CITY_BBOX_MIN_LAT: "24.7000",
  LAUNCH_CITY_BBOX_MAX_LAT: "25.1500",
  LAUNCH_CITY_BBOX_MIN_LON: "66.8500",
  LAUNCH_CITY_BBOX_MAX_LON: "67.3500",
  DEFAULT_CURRENCY: "PKR",
  STRIPE_ACCOUNT_COUNTRY: "PK",
  DRIVER_PRICE_MIN_CENTS: "500000",
  DRIVER_PRICE_MAX_CENTS: "3000000",
  REQUIRED_DRIVER_DOCUMENTS: "cnic,license,vehicle_registration",
};

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void,
): void {
  const original: Record<string, string | undefined> = {};

  // Backup and set
  for (const key of Object.keys({ ...baseEnv, ...overrides })) {
    original[key] = process.env[key];
  }
  for (const [k, v] of Object.entries({ ...baseEnv, ...overrides })) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  try {
    fn();
  } finally {
    // Restore
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    _resetEnvForTesting();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("loadEnv()", () => {
  beforeEach(() => {
    _resetEnvForTesting();
  });

  it("keeps authoritative road estimates disabled unless explicitly enabled", () => {
    withEnv({ MATCHING_ROAD_TIMES_ENABLED: undefined }, () => {
      expect(loadEnv().MATCHING_ROAD_TIMES_ENABLED).toBe(false);
      expect(loadEnv().MATCHING_ROAD_MAX_AGE_SECONDS).toBe(300);
    });
  });

  it("parses bounded routing policy values independently from display estimates", () => {
    withEnv(
      {
        MATCHING_ROAD_TIMES_ENABLED: "true",
        MATCHING_ROAD_TRAVEL_MULTIPLIER: "1.4",
      },
      () => {
        expect(loadEnv().MATCHING_ROAD_TIMES_ENABLED).toBe(true);
        expect(loadEnv().MATCHING_ROAD_TRAVEL_MULTIPLIER).toBe(1.4);
      },
    );
  });

  it("returns a parsed env object with all required fields on a valid config", () => {
    withEnv({}, () => {
      const env = loadEnv();
      expect(env.DATABASE_URL).toBe(
        "postgresql://user:pass@localhost:5432/testdb",
      );
      expect(env.DRIVER_PRICE_MIN_CENTS).toBe(500000);
      expect(env.DRIVER_PRICE_MAX_CENTS).toBe(3000000);
      expect(env.PORT).toBe(3000);
    });
  });

  it("exits non-zero when DATABASE_URL is missing", () => {
    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockStderr = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    withEnv({ DATABASE_URL: undefined }, () => {
      expect(() => loadEnv()).toThrow("process.exit called");
      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining("DATABASE_URL"),
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });

  it("exits non-zero when REDIS_URL is missing", () => {
    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockStderr = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    withEnv({ REDIS_URL: undefined }, () => {
      expect(() => loadEnv()).toThrow("process.exit called");
      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining("REDIS_URL"),
      );
    });

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });

  it('rejects CORS_ALLOWED_ORIGINS = "*" in production', () => {
    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockStderr = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    withEnv({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "*" }, () => {
      expect(() => loadEnv()).toThrow("process.exit called");
      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining("CORS_ALLOWED_ORIGINS"),
      );
    });

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });

  it('allows CORS_ALLOWED_ORIGINS = "*" in development', () => {
    withEnv({ NODE_ENV: "development", CORS_ALLOWED_ORIGINS: "*" }, () => {
      expect(() => loadEnv()).not.toThrow();
    });
  });

  it("rejects when DRIVER_PRICE_MAX_CENTS <= DRIVER_PRICE_MIN_CENTS", () => {
    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockStderr = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    withEnv(
      { DRIVER_PRICE_MIN_CENTS: "3000000", DRIVER_PRICE_MAX_CENTS: "500000" },
      () => {
        expect(() => loadEnv()).toThrow("process.exit called");
        expect(mockStderr).toHaveBeenCalledWith(
          expect.stringContaining("DRIVER_PRICE_MAX_CENTS"),
        );
      },
    );

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });

  it("rejects JWT_SECRET shorter than 32 characters", () => {
    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockStderr = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    withEnv({ JWT_SECRET: "tooshort" }, () => {
      expect(() => loadEnv()).toThrow("process.exit called");
      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining("JWT_SECRET"),
      );
    });

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });

  it("memoises the result — second call returns same object", () => {
    withEnv({}, () => {
      const first = loadEnv();
      const second = loadEnv();
      expect(second).toBe(first);
    });
  });

  it("getEnv() throws if loadEnv() was never called", async () => {
    _resetEnvForTesting();
    const { getEnv } = await import("./env.js");
    expect(() => getEnv()).toThrow("getEnv() called before loadEnv()");
  });

  describe("Service Bounding Box (AD-6)", () => {
    it("accepts valid ROUTE_SERVICE_BBOX alias and derives individual coordinates", () => {
      withEnv(
        {
          ROUTE_SERVICE_BBOX: "66.8500,24.7000,67.3500,25.1500",
          LAUNCH_CITY_BBOX_MIN_LAT: undefined,
          LAUNCH_CITY_BBOX_MAX_LAT: undefined,
          LAUNCH_CITY_BBOX_MIN_LON: undefined,
          LAUNCH_CITY_BBOX_MAX_LON: undefined,
        },
        () => {
          const env = loadEnv();
          expect(env.LAUNCH_CITY_BBOX_MIN_LON).toBe(66.85);
          expect(env.LAUNCH_CITY_BBOX_MIN_LAT).toBe(24.7);
          expect(env.LAUNCH_CITY_BBOX_MAX_LON).toBe(67.35);
          expect(env.LAUNCH_CITY_BBOX_MAX_LAT).toBe(25.15);
          expect(env.ROUTE_SERVICE_BBOX).toBe("66.85,24.7,67.35,25.15");
        },
      );
    });

    it("succeeds when alias and individual vars match within 0.0001 degrees", () => {
      withEnv(
        {
          ROUTE_SERVICE_BBOX: "66.85005,24.70005,67.35005,25.15005",
          LAUNCH_CITY_BBOX_MIN_LAT: "24.7000",
          LAUNCH_CITY_BBOX_MAX_LAT: "25.1500",
          LAUNCH_CITY_BBOX_MIN_LON: "66.8500",
          LAUNCH_CITY_BBOX_MAX_LON: "67.3500",
        },
        () => {
          expect(() => loadEnv()).not.toThrow();
        },
      );
    });

    it("fails fast when alias and individual vars describe different boxes", () => {
      const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
      const mockStderr = jest
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      withEnv(
        {
          ROUTE_SERVICE_BBOX: "66.8500,24.7000,67.3500,25.1500",
          LAUNCH_CITY_BBOX_MIN_LAT: "24.8000", // 0.1 deg discrepancy
          LAUNCH_CITY_BBOX_MAX_LAT: "25.1500",
          LAUNCH_CITY_BBOX_MIN_LON: "66.8500",
          LAUNCH_CITY_BBOX_MAX_LON: "67.3500",
        },
        () => {
          expect(() => loadEnv()).toThrow("process.exit called");
          expect(mockStderr).toHaveBeenCalledWith(
            expect.stringContaining("different bounding boxes"),
          );
        },
      );

      mockExit.mockRestore();
      mockStderr.mockRestore();
    });

    it("fails fast when ROUTE_SERVICE_BBOX is malformed", () => {
      const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
      const mockStderr = jest
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      withEnv(
        {
          ROUTE_SERVICE_BBOX: "not,numeric,coords,here",
        },
        () => {
          expect(() => loadEnv()).toThrow("process.exit called");
          expect(mockStderr).toHaveBeenCalledWith(
            expect.stringContaining("ROUTE_SERVICE_BBOX"),
          );
        },
      );

      mockExit.mockRestore();
      mockStderr.mockRestore();
    });

    it("fails fast when coordinates are inverted", () => {
      const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
      const mockStderr = jest
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      withEnv(
        {
          ROUTE_SERVICE_BBOX: "66.85,25.15,67.35,24.70", // inverted lat
          LAUNCH_CITY_BBOX_MIN_LAT: undefined,
          LAUNCH_CITY_BBOX_MAX_LAT: undefined,
          LAUNCH_CITY_BBOX_MIN_LON: undefined,
          LAUNCH_CITY_BBOX_MAX_LON: undefined,
        },
        () => {
          expect(() => loadEnv()).toThrow("process.exit called");
          expect(mockStderr).toHaveBeenCalledWith(
            expect.stringContaining("LAUNCH_CITY_BBOX_MAX_LAT"),
          );
        },
      );

      mockExit.mockRestore();
      mockStderr.mockRestore();
    });
  });
});

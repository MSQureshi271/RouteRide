/**
 * auth-register.integration.test.ts
 *
 * Tests for POST /auth/register (T0.25)
 * Follows TDD: tests cover all acceptance criteria from todo.md T0.25.
 *
 * Acceptance criteria:
 *  1. Weak password rejected → 400
 *  2. Malformed phone (non-E.164) → 400
 *  3. Privileged role (ADMIN, INSTITUTION_ADMIN, FLEET_ADMIN) → 400
 *  4. Duplicate phone → 409
 *  5. passwordHash absent from response
 *  6. Successful registration returns PENDING_VERIFICATION user
 *  7. Accepts DRIVER role
 */

jest.mock("@nestjs/jwt", () => ({
  JwtService: class {
    sign() {
      return "mock.access.token";
    }
  },
}));

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    JWT_SECRET: "a".repeat(64),
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 2592000,
  }),
}));

import { AuthService } from "../src/auth/auth.service.js";
import { TokenService } from "../src/auth/token.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { ConflictException } from "@nestjs/common";

function makePrismaMock(sqlMock?: jest.Mock) {
  return {
    sql:
      sqlMock ??
      jest
        .fn()
        .mockImplementation(
          (strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = strings.join(" ");
            if (query.includes("SELECT id FROM users")) {
              return Promise.resolve([]); // Not existing
            }
            if (query.includes("INSERT INTO users")) {
              const phone = values[0] as string;
              const fullName = values[1] as string;
              const role = values[3] as string;
              const email = (values[4] as string) ?? null;
              return Promise.resolve([
                {
                  id: "00000000-0000-0000-0000-000000000001",
                  phone,
                  full_name: fullName,
                  role,
                  status: "PENDING_VERIFICATION",
                  email,
                  profile_photo_url: null,
                  created_at: new Date("2026-01-01T00:00:00Z"),
                },
              ]);
            }
            return Promise.resolve([]);
          },
        ),
  } as unknown as PrismaService;
}

function makeJwtServiceMock() {
  return { sign: jest.fn().mockReturnValue("mock.access.token") };
}

function buildAuthService(prismaMock?: PrismaService) {
  const prisma = prismaMock ?? makePrismaMock();
  const tokenService = new TokenService(
    makeJwtServiceMock() as unknown as import("@nestjs/jwt").JwtService,
    prisma,
  );
  return new AuthService(prisma, tokenService);
}

describe("AuthService.register (T0.25)", () => {
  it("rejects a password shorter than 8 characters", async () => {
    const { RegisterRequestSchema } = await import("@routeride/contracts");
    const result = RegisterRequestSchema.safeParse({
      phone: "+923001234567",
      fullName: "Test User",
      password: "short",
      role: "CONSUMER",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a phone number not in E.164 format", async () => {
    const { RegisterRequestSchema } = await import("@routeride/contracts");

    const invalidPhones = [
      "03001234567", // missing leading +
      "+92 300 1234567", // contains spaces
      "0092-300-1234567", // contains dashes
      "+0123456789", // invalid country code starting with 0
      "+", // only plus sign
      "not-a-number", // alphabetical
    ];

    for (const phone of invalidPhones) {
      const result = RegisterRequestSchema.safeParse({
        phone,
        fullName: "Test User",
        password: "ValidPass1!",
        role: "CONSUMER",
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects ADMIN, INSTITUTION_ADMIN, and FLEET_ADMIN roles during registration", async () => {
    const { RegisterRequestSchema } = await import("@routeride/contracts");

    const privilegedRoles = ["ADMIN", "INSTITUTION_ADMIN", "FLEET_ADMIN"];
    for (const role of privilegedRoles) {
      const result = RegisterRequestSchema.safeParse({
        phone: "+923001234567",
        fullName: "Test User",
        password: "ValidPass1!",
        role,
      });
      expect(result.success).toBe(false);
    }
  });

  it("throws ConflictException for a duplicate phone number", async () => {
    const sqlMock = jest
      .fn()
      .mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join(" ");
        if (query.includes("SELECT id FROM users")) {
          return Promise.resolve([{ id: "existing-user-id" }]);
        }
        return Promise.resolve([]);
      });

    const prismaMock = makePrismaMock(sqlMock);
    const service = buildAuthService(prismaMock);

    await expect(
      service.register({
        phone: "+923001234567",
        fullName: "Test User",
        password: "ValidPass1!",
        role: "CONSUMER",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("does not include passwordHash in the response user object", async () => {
    const service = buildAuthService();
    const result = await service.register({
      phone: "+923001234567",
      fullName: "Test User",
      password: "ValidPass1!",
      role: "CONSUMER",
    });

    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.user).not.toHaveProperty("password_hash");
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    expect(JSON.stringify(result)).not.toContain("password_hash");
  });

  it("creates a user with PENDING_VERIFICATION status on success", async () => {
    const service = buildAuthService();
    const result = await service.register({
      phone: "+923001234567",
      fullName: "Jane Doe",
      password: "ValidPass1!",
      role: "CONSUMER",
    });

    expect(result.user.status).toBe("PENDING_VERIFICATION");
    expect(result.user.role).toBe("CONSUMER");
    expect(result.user.phone).toBe("+923001234567");
    expect(result.message).toMatch(/verify/i);
  });

  it("accepts DRIVER role during registration", async () => {
    const service = buildAuthService();
    const result = await service.register({
      phone: "+923001234568",
      fullName: "Driver User",
      password: "ValidPass1!",
      role: "DRIVER",
    });

    expect(result.user.role).toBe("DRIVER");
    expect(result.user.status).toBe("PENDING_VERIFICATION");
  });
});

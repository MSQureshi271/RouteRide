/**
 * auth-reset.integration.test.ts
 *
 * Tests for password reset via phone OTP (T0.30).
 *
 * Acceptance criteria:
 *  1. POST /auth/forgot-password returns identical response for existing and non-existent accounts
 *  2. Timing protection: dummy bcrypt hash executed for non-existent accounts
 *  3. POST /auth/reset-password verifies OTP and updates passwordHash
 *  4. Password reset revokes ALL active sessions / refresh tokens for the user
 *  5. Invalid or expired reset OTP throws 401 UnauthorizedException
 */

jest.mock("@nestjs/jwt", () => ({
  JwtService: class {
    sign() {
      return "mock.jwt";
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

import { PasswordResetService } from "../src/auth/password-reset.service.js";
import { OtpService } from "../src/auth/otp.service.js";
import { TokenService } from "../src/auth/token.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { UnauthorizedException } from "@nestjs/common";

describe("PasswordResetService (T0.30)", () => {
  let prismaMock: PrismaService;
  let otpServiceMock: OtpService;
  let tokenServiceMock: TokenService;
  let resetService: PasswordResetService;

  let updatedPasswordHash: string | null = null;
  let revokedAllUserTokens = false;
  let resetOtpSent = false;
  let resetOtpVerified = false;

  const EXISTING_PHONE = "+923001234567";
  const NON_EXISTENT_PHONE = "+923009999999";
  const USER_ID = "00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    updatedPasswordHash = null;
    revokedAllUserTokens = false;
    resetOtpSent = false;
    resetOtpVerified = false;

    prismaMock = {
      sql: jest
        .fn()
        .mockImplementation(
          (strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = strings.join(" ").replace(/\s+/g, " ");

            // Check if phone exists
            if (query.includes("SELECT id FROM users WHERE phone =")) {
              const phone = values[0] as string;
              if (phone === EXISTING_PHONE) {
                return Promise.resolve([{ id: USER_ID }]);
              }
              return Promise.resolve([]);
            }

            // Update password hash
            if (query.includes("UPDATE users SET password_hash =")) {
              updatedPasswordHash = values[0] as string;
              return Promise.resolve([]);
            }

            return Promise.resolve([]);
          },
        ),
    } as unknown as PrismaService;

    otpServiceMock = {
      sendResetOtp: jest.fn().mockImplementation((phone: string) => {
        if (phone === EXISTING_PHONE) {
          resetOtpSent = true;
        }
        return Promise.resolve();
      }),
      verifyResetOtp: jest
        .fn()
        .mockImplementation((phone: string, code: string) => {
          if (phone === EXISTING_PHONE && code === "123456") {
            resetOtpVerified = true;
            return Promise.resolve();
          }
          throw new UnauthorizedException("Incorrect code.");
        }),
    } as unknown as OtpService;

    tokenServiceMock = {
      revokeAllForUser: jest.fn().mockImplementation((uId: string) => {
        if (uId === USER_ID) {
          revokedAllUserTokens = true;
        }
        return Promise.resolve();
      }),
    } as unknown as TokenService;

    resetService = new PasswordResetService(
      prismaMock,
      otpServiceMock,
      tokenServiceMock,
    );
  });

  it("returns identical response for existing and non-existent accounts on initiate", async () => {
    const resExisting = await resetService.initiate(EXISTING_PHONE);
    const resNonExistent = await resetService.initiate(NON_EXISTENT_PHONE);

    expect(resExisting.message).toBe(resNonExistent.message);
    expect(resExisting.message).toMatch(
      /If an account with that phone number exists/i,
    );
    expect(resetOtpSent).toBe(true);
  });

  it("completes password reset: verifies OTP, hashes new password, and revokes all user sessions", async () => {
    const result = await resetService.complete(
      EXISTING_PHONE,
      "123456",
      "NewStrongPass123!",
    );

    expect(result.message).toMatch(/Password reset successful/i);
    expect(resetOtpVerified).toBe(true);
    expect(updatedPasswordHash).toBeDefined();
    // bcrypt hash starts with $2b$
    expect(updatedPasswordHash).toMatch(/^\$2b\$12\$/);
    // All active tokens must be revoked
    expect(revokedAllUserTokens).toBe(true);
  });

  it("rejects password reset with invalid or expired OTP code", async () => {
    await expect(
      resetService.complete(EXISTING_PHONE, "999999", "NewStrongPass123!"),
    ).rejects.toThrow(UnauthorizedException);

    expect(updatedPasswordHash).toBeNull();
    expect(revokedAllUserTokens).toBe(false);
  });
});

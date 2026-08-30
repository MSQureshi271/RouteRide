/**
 * auth-google.integration.test.ts
 *
 * Tests for Google OAuth ID token verification (T0.28).
 *
 * Acceptance criteria:
 *  1. Valid token from new user creates account with status ACTIVE and returns token pair
 *  2. Valid token from existing user matches existing account by email and returns token pair
 *  3. Invalid / forged token throws 401 UnauthorizedException
 *  4. Google service unreachable (network error) throws 503 ServiceUnavailableException
 *  5. Missing GOOGLE_CLIENT_ID throws 503 ServiceUnavailableException
 */

jest.mock("@nestjs/jwt", () => {
  return {
    JwtService: class {
      sign(payload: Record<string, unknown>) {
        return `jwt.${Buffer.from(JSON.stringify(payload)).toString("base64")}.sig`;
      }
    },
  };
});

let mockClientId: string | undefined =
  "mock-google-client-id.apps.googleusercontent.com";

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    GOOGLE_CLIENT_ID: mockClientId,
    JWT_SECRET: "a".repeat(64),
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 2592000,
  }),
}));

import { GoogleService } from "../src/auth/google.service.js";
import { TokenService } from "../src/auth/token.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import {
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";

interface DbUserRow {
  id: string;
  phone: string;
  full_name: string;
  role: string;
  status: string;
  email: string | null;
  profile_photo_url: string | null;
  created_at: string;
  driver_profile_id?: string | null;
}

describe("GoogleService (T0.28)", () => {
  let usersByEmail: Map<string, DbUserRow>;
  let prismaMock: PrismaService;
  let tokenService: TokenService;
  let googleService: GoogleService;

  beforeEach(() => {
    mockClientId = "mock-google-client-id.apps.googleusercontent.com";
    usersByEmail = new Map();

    prismaMock = {
      sql: jest
        .fn()
        .mockImplementation(
          (strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = strings.join(" ").replace(/\s+/g, " ");

            // SELECT user by email
            if (
              query.includes("FROM users u") &&
              query.includes("WHERE u.email =")
            ) {
              const email = values[0] as string;
              const user = usersByEmail.get(email);
              return Promise.resolve(user ? [user] : []);
            }

            // INSERT user
            if (query.includes("INSERT INTO users")) {
              const email = values[0] as string;
              const fullName = values[1] as string;
              const role = values[2] as string;
              const profilePhotoUrl = (values[3] as string) ?? null;
              const phone = values[4] as string;

              const created: DbUserRow = {
                id: "google-user-uuid-1",
                phone,
                full_name: fullName,
                role,
                status: "ACTIVE",
                email,
                profile_photo_url: profilePhotoUrl,
                created_at: new Date().toISOString(),
              };
              usersByEmail.set(email, created);
              return Promise.resolve([created]);
            }

            // INSERT refresh_tokens
            if (query.includes("INSERT INTO refresh_tokens")) {
              return Promise.resolve([]);
            }

            return Promise.resolve([]);
          },
        ),
    } as unknown as PrismaService;

    const jwtService = new (jest.requireMock("@nestjs/jwt").JwtService)();
    tokenService = new TokenService(jwtService, prismaMock);
    googleService = new GoogleService(prismaMock, tokenService);
  });

  it("verifies valid token for a new user, creates account as ACTIVE, and issues tokens", async () => {
    // Mock OAuth2Client.verifyIdToken
    jest
      .spyOn(
        (googleService as unknown as { client: { verifyIdToken: jest.Mock } })
          .client,
        "verifyIdToken",
      )
      .mockResolvedValue({
        getPayload: () => ({
          sub: "google-sub-12345",
          email: "newuser@example.com",
          name: "New Google User",
          picture: "https://lh3.googleusercontent.com/photo.jpg",
        }),
      } as never);

    const result = await googleService.verifyAndUpsert(
      "valid-id-token",
      "CONSUMER",
    );

    expect(result.isNewUser).toBe(true);
    expect(result.user.email).toBe("newuser@example.com");
    expect(result.user.fullName).toBe("New Google User");
    expect(result.user.status).toBe("ACTIVE");
    expect(result.tokens.accessToken).toBeDefined();
    expect(result.tokens.refreshToken).toBeDefined();
  });

  it("matches existing user by email and issues tokens without creating duplicate", async () => {
    // Pre-seed an existing user
    usersByEmail.set("existing@example.com", {
      id: "existing-user-uuid",
      phone: "+923009999999",
      full_name: "Existing User",
      role: "CONSUMER",
      status: "ACTIVE",
      email: "existing@example.com",
      profile_photo_url: null,
      created_at: new Date().toISOString(),
    });

    jest
      .spyOn(
        (googleService as unknown as { client: { verifyIdToken: jest.Mock } })
          .client,
        "verifyIdToken",
      )
      .mockResolvedValue({
        getPayload: () => ({
          sub: "google-sub-67890",
          email: "existing@example.com",
          name: "Existing User",
        }),
      } as never);

    const result = await googleService.verifyAndUpsert("valid-id-token");

    expect(result.isNewUser).toBe(false);
    expect(result.user.id).toBe("existing-user-uuid");
    expect(result.tokens.accessToken).toBeDefined();
  });

  it("throws 401 UnauthorizedException for invalid or expired ID token", async () => {
    jest
      .spyOn(
        (googleService as unknown as { client: { verifyIdToken: jest.Mock } })
          .client,
        "verifyIdToken",
      )
      .mockRejectedValue(
        new Error("Wrong recipient, payload audience doesn't match"),
      );

    await expect(
      googleService.verifyAndUpsert("forged-or-expired-token"),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("throws 503 ServiceUnavailableException when Google is unreachable", async () => {
    jest
      .spyOn(
        (googleService as unknown as { client: { verifyIdToken: jest.Mock } })
          .client,
        "verifyIdToken",
      )
      .mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    await expect(googleService.verifyAndUpsert("some-token")).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it("throws 503 ServiceUnavailableException when GOOGLE_CLIENT_ID is not configured", async () => {
    mockClientId = undefined;

    await expect(googleService.verifyAndUpsert("some-token")).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

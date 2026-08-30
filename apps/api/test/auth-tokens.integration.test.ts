/**
 * auth-tokens.integration.test.ts
 *
 * Tests for dual-token JWT + refresh-token rotation (T0.27).
 *
 * Acceptance criteria:
 *  1. Access token + refresh token issued with exact required claims (sub, role, status)
 *  2. Refreshing access token rotates refresh token and invalidates previous token
 *  3. Replay attack detection: presenting an already-revoked token revokes entire token family
 *  4. Expired refresh token rejected with 401
 *  5. Logout revokes the refresh token
 *  6. Plaintext refresh token is NEVER stored (only SHA-256 hash in DB)
 */

jest.mock("@nestjs/jwt", () => {
  return {
    JwtService: class {
      sign(payload: Record<string, unknown>) {
        return `jwt.${Buffer.from(JSON.stringify(payload)).toString("base64")}.sig`;
      }
      verify(token: string) {
        const parts = token.split(".");
        return JSON.parse(Buffer.from(parts[1]!, "base64").toString("utf-8"));
      }
    },
  };
});

jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    JWT_SECRET: "a".repeat(64),
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 2592000,
  }),
}));

import { TokenService } from "../src/auth/token.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createHash } from "node:crypto";

function sha256(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

interface MockTokenRecord {
  id: string;
  token_hash: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
}

interface MockUserRecord {
  id: string;
  role: string;
  status: string;
  driver_profile_id: string | null;
}

describe("TokenService (T0.27)", () => {
  let tokensTable: Map<string, MockTokenRecord>;
  let usersTable: Map<string, MockUserRecord>;
  let prismaMock: PrismaService;
  let tokenService: TokenService;

  beforeEach(() => {
    tokensTable = new Map();
    usersTable = new Map();

    const userId = "00000000-0000-0000-0000-000000000001";
    usersTable.set(userId, {
      id: userId,
      role: "CONSUMER",
      status: "ACTIVE",
      driver_profile_id: null,
    });

    prismaMock = {
      sql: jest
        .fn()
        .mockImplementation(
          (strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = strings.join(" ").replace(/\s+/g, " ");

            // INSERT INTO refresh_tokens
            if (query.includes("INSERT INTO refresh_tokens")) {
              const tokenHash = values[0] as string;
              const uId = values[1] as string;
              const expiresAt = values[2] as string;
              tokensTable.set(tokenHash, {
                id: `rt-${tokensTable.size + 1}`,
                token_hash: tokenHash,
                user_id: uId,
                expires_at: expiresAt,
                revoked_at: null,
              });
              return Promise.resolve([]);
            }

            // SELECT FROM refresh_tokens
            if (
              query.includes("FROM refresh_tokens") &&
              query.includes("WHERE token_hash =")
            ) {
              const tokenHash = values[0] as string;
              const record = tokensTable.get(tokenHash);
              return Promise.resolve(record ? [record] : []);
            }

            // UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash
            if (
              query.includes("UPDATE refresh_tokens") &&
              query.includes("WHERE token_hash =")
            ) {
              const tokenHash = values[0] as string;
              const record = tokensTable.get(tokenHash);
              if (record && record.revoked_at === null) {
                record.revoked_at = new Date().toISOString();
              }
              return Promise.resolve([]);
            }

            // UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id
            if (
              query.includes("UPDATE refresh_tokens") &&
              query.includes("WHERE user_id =")
            ) {
              const uId = values[0] as string;
              for (const record of tokensTable.values()) {
                if (record.user_id === uId) {
                  record.revoked_at = new Date().toISOString();
                }
              }
              return Promise.resolve([]);
            }

            // SELECT FROM users LEFT JOIN driver_profiles
            if (query.includes("FROM users u")) {
              const uId = values[0] as string;
              const user = usersTable.get(uId);
              return Promise.resolve(user ? [user] : []);
            }

            return Promise.resolve([]);
          },
        ),
    } as unknown as PrismaService;

    const jwtService = new (jest.requireMock("@nestjs/jwt").JwtService)();
    tokenService = new TokenService(jwtService, prismaMock);
  });

  it("issues an access token and refresh token pair", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const pair = await tokenService.issueTokenPair(
      userId,
      "CONSUMER",
      "ACTIVE",
    );

    expect(pair.accessToken).toBeDefined();
    expect(pair.refreshToken).toBeDefined();
    expect(pair.expiresIn).toBe(900); // 15m

    // Raw token is 128 hex chars (64 bytes)
    expect(pair.refreshToken.length).toBe(128);

    // Stored token is SHA-256 hash
    const expectedHash = sha256(pair.refreshToken);
    const stored = tokensTable.get(expectedHash);
    expect(stored).toBeDefined();
    expect(stored?.token_hash).toBe(expectedHash);
    // Plaintext is NEVER stored
    for (const record of tokensTable.values()) {
      expect(record.token_hash).not.toBe(pair.refreshToken);
    }
  });

  it("rotates refresh token: old token revoked and new pair returned", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const initial = await tokenService.issueTokenPair(
      userId,
      "CONSUMER",
      "ACTIVE",
    );

    const rotated = await tokenService.refresh(initial.refreshToken);

    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    expect(rotated.accessToken).toBeDefined();

    // Old token must be marked as revoked
    const oldHash = sha256(initial.refreshToken);
    expect(tokensTable.get(oldHash)?.revoked_at).not.toBeNull();

    // New token must be active (not revoked)
    const newHash = sha256(rotated.refreshToken);
    expect(tokensTable.get(newHash)?.revoked_at).toBeNull();
  });

  it("detects replay attack and revokes the entire token family", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const initial = await tokenService.issueTokenPair(
      userId,
      "CONSUMER",
      "ACTIVE",
    );

    // Legitimate rotation:
    const second = await tokenService.refresh(initial.refreshToken);

    // Replay attack: Attacker tries to use the initial (now revoked) token again
    await expect(tokenService.refresh(initial.refreshToken)).rejects.toThrow(
      /Refresh token already used\. Please log in again\./,
    );

    // The family must be revoked — second token should now also be revoked
    const secondHash = sha256(second.refreshToken);
    expect(tokensTable.get(secondHash)?.revoked_at).not.toBeNull();
  });

  it("rejects expired refresh token", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const pair = await tokenService.issueTokenPair(
      userId,
      "CONSUMER",
      "ACTIVE",
    );

    // Manually set expiration to the past
    const hash = sha256(pair.refreshToken);
    const record = tokensTable.get(hash)!;
    record.expires_at = new Date(Date.now() - 1000).toISOString();

    await expect(tokenService.refresh(pair.refreshToken)).rejects.toThrow(
      /Refresh token has expired/,
    );
  });

  it("revokes token on logout", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const pair = await tokenService.issueTokenPair(
      userId,
      "CONSUMER",
      "ACTIVE",
    );

    await tokenService.logout(pair.refreshToken);

    const hash = sha256(pair.refreshToken);
    expect(tokensTable.get(hash)?.revoked_at).not.toBeNull();
  });
});

/**
 * TokenService — issues and manages dual-token sessions.
 *
 * Access token:  15-minute HS256 JWT carrying sub, role, driverProfileId, status.
 * Refresh token: 64-byte random opaque string, stored ONLY as SHA-256 hex digest
 *                in the refresh_tokens table. Never persisted in plaintext.
 *
 * Refresh-token rotation:
 *  - On each refresh: old token is revoked, new pair issued.
 *  - Replay detection: using an already-revoked token revokes the entire user
 *    family (all tokens for that user), forcing re-login.
 *
 * Source (JWT rotation pattern):
 *  https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
 */
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service.js";
import { getEnv } from "@routeride/config";
import { randomBytes, createHash } from "node:crypto";
import type { JwtPayload } from "../common/decorators/current-user.decorator.js";
import type { AuthTokens } from "@routeride/contracts";

interface StoredRefreshToken {
  id: string;
  token_hash: string;
  user_id: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
}

interface UserWithDriverProfile {
  id: string;
  role: string;
  status: string;
  driver_profile_id: string | null;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Issue ─────────────────────────────────────────────────────────────────

  async issueTokenPair(
    userId: string,
    role: string,
    status: string,
    driverProfileId?: string,
  ): Promise<AuthTokens> {
    const env = getEnv();

    // 1. Access token — short-lived JWT
    const payload: Omit<JwtPayload, "iat" | "exp"> = {
      sub: userId,
      role,
      status,
      ...(driverProfileId ? { driverProfileId } : {}),
    };
    const accessToken = this.jwtService.sign(payload);

    // 2. Refresh token — 64 random bytes, stored as SHA-256
    const rawToken = randomBytes(64).toString("hex");
    const tokenHash = sha256(rawToken);

    const expiresAt = new Date(
      Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1_000,
    ).toISOString();

    await this.prisma.sql`
      INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
      VALUES (${tokenHash}, ${userId}::uuid, ${expiresAt}::timestamptz)
    `;

    return {
      accessToken,
      refreshToken: rawToken,
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    };
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = sha256(rawRefreshToken);

    const storedRows = (await this.prisma.sql`
      SELECT id, token_hash, user_id, expires_at, revoked_at
      FROM refresh_tokens
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `) as unknown as StoredRefreshToken[];

    const stored = storedRows[0];
    if (!stored) {
      throw new UnauthorizedException("Refresh token not found");
    }

    // Replay detection: token already revoked → revoke entire user family
    if (stored.revoked_at !== null) {
      this.logger.warn(
        `Replay attack detected for userId=${stored.user_id}. Revoking all tokens.`,
      );
      await this.revokeAllForUser(stored.user_id);
      throw new UnauthorizedException(
        "Refresh token already used. Please log in again.",
      );
    }

    const expiry = new Date(stored.expires_at);
    if (expiry < new Date()) {
      throw new UnauthorizedException("Refresh token has expired");
    }

    // Revoke the old token
    await this.prisma.sql`
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = ${tokenHash}
    `;

    // Look up the user to get current role + status
    const userRows = (await this.prisma.sql`
      SELECT u.id, u.role, u.status, dp.id AS driver_profile_id
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.id = ${stored.user_id}::uuid
      LIMIT 1
    `) as unknown as UserWithDriverProfile[];

    const user = userRows[0];
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return this.issueTokenPair(
      user.id,
      user.role,
      user.status,
      user.driver_profile_id ?? undefined,
    );
  }

  // ─── Logout ────────────────────────────────────────────────────────────────

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = sha256(rawRefreshToken);
    await this.prisma.sql`
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
    `;
  }

  // ─── Revoke all ────────────────────────────────────────────────────────────

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.sql`
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = ${userId}::uuid AND revoked_at IS NULL
    `;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

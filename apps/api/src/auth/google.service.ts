/**
 * GoogleService — server-side Google ID token verification for OAuth.
 *
 * Flow:
 *  1. Mobile client exchanges auth code with Google → receives ID token
 *  2. Client sends ID token to POST /auth/oauth/google
 *  3. This service validates the ID token signature against Google's JWKS
 *  4. On success: upsert user (matched by Google sub + email), issue token pair
 *
 * Validation:
 *  - Signature: verified against Google's public keys (cached automatically by google-auth-library)
 *  - Audience: must match GOOGLE_CLIENT_ID
 *  - Issuer: must be 'accounts.google.com' or 'https://accounts.google.com'
 *  - Expiry: enforced by google-auth-library
 *
 * Errors:
 *  - Forged/expired/wrong-aud token → 401 UnauthorizedException
 *  - Google unreachable → 503 ServiceUnavailableException
 *
 * Source: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { PrismaService } from "../prisma/prisma.service.js";
import { TokenService } from "./token.service.js";
import { getEnv } from "@routeride/config";
import type { UserSummary, AuthTokens } from "@routeride/contracts";

export interface GoogleAuthResult {
  user: UserSummary;
  tokens: AuthTokens;
  isNewUser: boolean;
}

interface DbUserRow {
  id: string;
  phone: string;
  full_name: string;
  role: string;
  status: string;
  email: string | null;
  profile_photo_url: string | null;
  created_at: string | Date;
  driver_profile_id?: string | null;
}

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private readonly client: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {
    this.client = new OAuth2Client();
  }

  async verifyAndUpsert(
    idToken: string,
    role?: "CONSUMER" | "DRIVER",
  ): Promise<GoogleAuthResult> {
    const clientId = getEnv().GOOGLE_CLIENT_ID;

    if (!clientId) {
      throw new ServiceUnavailableException(
        "Google OAuth is not configured on this server",
      );
    }

    // ── Verify ID token against Google's JWKS ──────────────────────────────
    let ticket;
    try {
      ticket = await this.client.verifyIdToken({
        idToken,
        audience: clientId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (
        message.includes("ECONNREFUSED") ||
        message.includes("ENOTFOUND") ||
        message.includes("timeout") ||
        message.includes("fetch")
      ) {
        this.logger.error({
          event: "google.oauth.unreachable",
          error: message,
        });
        throw new ServiceUnavailableException(
          "Unable to reach Google's authentication service. Please try again later.",
        );
      }

      this.logger.warn({ event: "google.oauth.invalid_token", error: message });
      throw new UnauthorizedException(
        "Google authentication failed. The token is invalid or expired.",
      );
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      throw new UnauthorizedException("Invalid Google token payload");
    }

    // ── Upsert user ────────────────────────────────────────────────────────
    let isNewUser = false;

    // Try to find by email first (most reliable cross-method match)
    const existingRows = (await this.prisma.sql`
      SELECT u.id, u.phone, u.full_name, u.role, u.status, u.email,
             u.profile_photo_url, u.created_at, dp.id AS driver_profile_id
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.email = ${payload.email}
      LIMIT 1
    `) as unknown as DbUserRow[];

    let user = existingRows[0];

    if (!user) {
      isNewUser = true;
      const assignedRole = role ?? "CONSUMER";

      const insertedRows = (await this.prisma.sql`
        INSERT INTO users (email, full_name, role, status, profile_photo_url, phone)
        VALUES (
          ${payload.email},
          ${payload.name ?? payload.email},
          ${assignedRole}::user_role,
          'ACTIVE'::user_status,
          ${payload.picture ?? null},
          ${`google:${payload.sub}`}
        )
        RETURNING id, phone, full_name, role, status, email, profile_photo_url, created_at
      `) as unknown as DbUserRow[];

      user = insertedRows[0]!;
      this.logger.log({
        event: "user.google.created",
        userId: user.id,
        role: user.role,
      });
    } else {
      this.logger.log({ event: "user.google.matched", userId: user.id });
    }

    const tokens = await this.tokenService.issueTokenPair(
      user.id,
      user.role,
      user.status,
      user.driver_profile_id ?? undefined,
    );

    return {
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name,
        role: user.role as UserSummary["role"],
        status: user.status as UserSummary["status"],
        email: user.email ?? null,
        profilePhotoUrl: user.profile_photo_url ?? null,
        createdAt: new Date(user.created_at).toISOString(),
      },
      tokens,
      isNewUser,
    };
  }
}

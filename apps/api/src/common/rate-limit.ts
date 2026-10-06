/**
 * Rate-limiting guards implementing every row of TRD §12.4.
 *
 * All guards are Redis-backed (distributed) via @nest-lab/throttler-storage-redis.
 *
 * TRD §12.4 rate-limit table:
 *  Auth endpoints:  5 req / IP / 10 min
 *  OTP verify:      3 req / phone / 5 min
 *  Search:          30 req / userId / 1 min
 *  General:         200 req / userId / 1 min
 *
 * On limit exceeded: 429 Too Many Requests + Retry-After header (seconds).
 *
 * Source: https://docs.nestjs.com/security/rate-limiting
 */
import { Injectable, ExecutionContext } from "@nestjs/common";
import {
  ThrottlerGuard,
  ThrottlerException,
  ThrottlerLimitDetail,
  ThrottlerRequest,
} from "@nestjs/throttler";

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  body?: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the request's real IP (honours X-Forwarded-For from trusted proxies). */
function getIp(request: RequestWithHeaders): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() ?? request.ip ?? "unknown";
  }
  return request.ip ?? "unknown";
}

/**
 * Extract user ID from authenticated JWT payload on the request object,
 * or safely decode the Bearer token claims if the global APP_GUARD executes
 * before controller-scoped JwtAuthGuard has attached request.user.
 */
function getUserId(
  request: RequestWithHeaders & { user?: { sub?: string; id?: string } },
): string {
  const user = (request as unknown as { user?: { sub?: string; id?: string } })
    .user;
  if (user?.sub) return user.sub;
  if (user?.id) return user.id;

  // If request.user is not yet populated (e.g. global APP_GUARD executes before controller-level JwtAuthGuard),
  // extract sub claim directly from Bearer token if present
  const authHeader =
    request.headers["authorization"] ?? request.headers["Authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7).trim();
      const parts = token.split(".");
      const payloadPart = parts[1];
      if (parts.length === 3 && typeof payloadPart === "string") {
        const payloadJson = Buffer.from(payloadPart, "base64url").toString(
          "utf8",
        );
        const payload = JSON.parse(payloadJson);
        if (typeof payload?.sub === "string" && payload.sub.length > 0) {
          return payload.sub;
        }
      }
    } catch {
      // Ignore token parse error and fall back to IP
    }
  }

  return getIp(request); // fall back to IP if not authenticated
}

// ─── Base Named Throttler Guard ───────────────────────────────────────────────

/**
 * Base throttler guard that only evaluates the specific named throttler it is assigned to.
 *
 * In @nestjs/throttler, when multiple named throttlers are configured in ThrottlerModule,
 * ThrottlerGuard.canActivate() iterates over ALL named throttlers by default.
 * Subclasses extending NamedThrottlerGuard only execute handleRequest for their designated
 * throttlerName, bypassing all other throttlers so general requests don't exhaust auth/otp quotas.
 */
export abstract class NamedThrottlerGuard extends ThrottlerGuard {
  protected abstract readonly throttlerName: string;

  protected override async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    if (requestProps.throttler.name !== this.throttlerName) {
      return true;
    }
    return super.handleRequest(requestProps);
  }
}

// ─── Auth Rate Limit Guard (5 / IP / 10 min) ─────────────────────────────────

@Injectable()
export class AuthRateLimitGuard extends NamedThrottlerGuard {
  protected override readonly throttlerName = "auth";

  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    return `auth:${getIp(req as unknown as RequestWithHeaders)}`;
  }

  protected override throwThrottlingException(
    _ctx: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new ThrottlerException(
      "Too many auth requests. Try again in 10 minutes.",
    );
  }
}

// ─── OTP Rate Limit Guard (3 / phone / 5 min) ────────────────────────────────

@Injectable()
export class OtpRateLimitGuard extends NamedThrottlerGuard {
  protected override readonly throttlerName = "otp";

  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const body = req["body"] as Record<string, unknown> | undefined;
    const phone =
      typeof body?.["phone"] === "string"
        ? body["phone"]
        : getIp(req as unknown as RequestWithHeaders);
    return `otp:${phone}`;
  }

  protected override throwThrottlingException(
    _ctx: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new ThrottlerException(
      "Too many OTP requests. Try again in 5 minutes.",
    );
  }
}

// ─── Search Rate Limit Guard (30 / userId / 1 min) ───────────────────────────

@Injectable()
export class SearchRateLimitGuard extends NamedThrottlerGuard {
  protected override readonly throttlerName = "search";

  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    return `search:${getUserId(req as unknown as RequestWithHeaders)}`;
  }

  protected override throwThrottlingException(
    _ctx: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new ThrottlerException(
      "Search rate limit exceeded. Try again in 1 minute.",
    );
  }
}

// ─── General Rate Limit Guard (200 / userId / 1 min) ─────────────────────────

@Injectable()
export class GeneralRateLimitGuard extends NamedThrottlerGuard {
  protected override readonly throttlerName = "general";

  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    return `general:${getUserId(req as unknown as RequestWithHeaders)}`;
  }

  protected override throwThrottlingException(
    _ctx: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new ThrottlerException("Rate limit exceeded. Please slow down.");
  }
}

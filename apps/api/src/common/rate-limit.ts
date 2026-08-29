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

/** Extract user ID from authenticated JWT payload on the request object. */
function getUserId(
  request: RequestWithHeaders & { user?: { id?: string } },
): string {
  const user = (request as unknown as { user?: { id?: string } }).user;
  return user?.id ?? getIp(request); // fall back to IP if not authenticated
}

// ─── Auth Rate Limit Guard (5 / IP / 10 min) ─────────────────────────────────

@Injectable()
export class AuthRateLimitGuard extends ThrottlerGuard {
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
export class OtpRateLimitGuard extends ThrottlerGuard {
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
export class SearchRateLimitGuard extends ThrottlerGuard {
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
export class GeneralRateLimitGuard extends ThrottlerGuard {
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

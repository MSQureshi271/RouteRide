/**
 * JWT Strategy — Passport strategy for validating Bearer access tokens.
 *
 * Validates:
 *  - Token signature against JWT_SECRET
 *  - Token expiry (enforced by jsonwebtoken library)
 *  - User exists, is ACTIVE (not SUSPENDED or DELETED)
 *
 * On success, populates request.user with the JwtPayload.
 * On failure, JwtAuthGuard calls handleRequest() which throws UnauthorizedException.
 *
 * Source: https://docs.nestjs.com/security/authentication#implementing-the-jwt-strategy
 */
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { getEnv } from "@routeride/config";
import type { JwtPayload } from "../common/decorators/current-user.decorator.js";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getEnv().JWT_SECRET,
    });
  }

  /**
   * Called after signature & expiry are verified by Passport.
   * Validates that the token's status claim is still valid.
   *
   * Returns the payload which is attached to request.user.
   */
  validate(payload: JwtPayload): JwtPayload {
    if (payload.status === "SUSPENDED" || payload.status === "DELETED") {
      throw new UnauthorizedException(
        "This account has been suspended or deleted",
      );
    }
    return payload;
  }
}

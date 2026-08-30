/**
 * @CurrentUser() parameter decorator — extracts the authenticated user from
 * the request object populated by JwtAuthGuard / PassportStrategy.
 *
 * Usage:
 *   @Get('me')
 *   getMe(@CurrentUser() user: JwtPayload) { ... }
 */
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

export interface JwtPayload {
  sub: string; // userId (UUID)
  role: string; // UserRole enum value
  driverProfileId?: string;
  status: string; // UserStatus enum value
  iat: number;
  exp: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    return (request as FastifyRequest & { user: JwtPayload }).user;
  },
);

/**
 * OwnershipGuard — verifies that the authenticated user owns the resource
 * identified by a route parameter.
 *
 * Applied as a method-level guard using @CheckOwnership() metadata.
 * ADMIN role bypasses ownership checks (they can access any resource).
 *
 * Example:
 *   @UseGuards(JwtAuthGuard, OwnershipGuard)
 *   @CheckOwnership({ paramName: 'riderId', resourceType: 'rider' })
 *   @Get(':riderId')
 *   getRider(@Param('riderId') riderId: string, @CurrentUser() user: JwtPayload) {}
 *
 * The actual DB lookup for resource ownership is delegated to the service
 * layer (the guard itself does NOT query the DB — that would couple it to
 * Prisma). Instead it checks user.sub against a userId resolved by services
 * that implement the OwnershipResolver interface.
 *
 * For T0.29 matrix enforcement we validate ownership inline in services.
 * The guard is the structural hook; service methods do the DB assertion.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtPayload } from "../decorators/current-user.decorator.js";
import type { FastifyRequest } from "fastify";

export interface OwnershipOptions {
  /** Route parameter name holding the resource ID (e.g. 'riderId') */
  paramName?: string;
  /** Route parameter name holding the user ID to match against user.sub (e.g. 'userId') */
  userIdParam?: string;
  /** Descriptive resource type for error messages (e.g. 'rider') */
  resourceType: string;
}

export const OWNERSHIP_KEY = "ownership";

export const CheckOwnership = (options: OwnershipOptions) =>
  Reflect.metadata(OWNERSHIP_KEY, options);

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.get<OwnershipOptions | undefined>(
      OWNERSHIP_KEY,
      context.getHandler(),
    );

    // No @CheckOwnership() annotation → pass through to service-level check
    if (!options) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const user = (request as FastifyRequest & { user?: JwtPayload }).user;

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    // ADMIN bypasses ownership — they can access any resource
    if (user.role === "ADMIN") return true;

    // Route-level param check when userIdParam is specified
    if (options.userIdParam) {
      const params = (request.params as Record<string, string>) || {};
      const targetUserId = params[options.userIdParam];
      if (targetUserId && targetUserId !== user.sub) {
        throw new ForbiddenException(
          `You do not have permission to access this ${options.resourceType}`,
        );
      }
    }

    return true;
  }
}

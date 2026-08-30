/**
 * RolesGuard — enforces role-based access control.
 *
 * Works after JwtAuthGuard has populated request.user. Reads the @Roles()
 * metadata on the handler/class. If no @Roles() metadata is present, the
 * guard passes (any authenticated user is allowed).
 *
 * RBAC matrix reference: tasks/todo.md T0.29 / docs/SPEC-identity.md
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import type { JwtPayload } from "../decorators/current-user.decorator.js";
import type { FastifyRequest } from "fastify";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() annotation → any authenticated user may proceed
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const user = (request as FastifyRequest & { user?: JwtPayload }).user;

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        "You do not have permission to perform this action",
      );
    }

    return true;
  }
}

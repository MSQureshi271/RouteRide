/**
 * @Roles(...roles) decorator — specifies which roles may access a route.
 *
 * Works in conjunction with RolesGuard. If no roles are specified on a
 * protected route the guard allows any authenticated user through.
 *
 * Usage:
 *   @Roles('ADMIN')
 *   @Get('metrics')
 *   getMetrics() {}
 */
import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@routeride/contracts";

export const ROLES_KEY = "roles";

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

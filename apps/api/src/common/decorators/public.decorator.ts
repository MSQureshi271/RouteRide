/**
 * @Public() decorator — marks an endpoint as publicly accessible.
 *
 * When applied to a controller or handler, the JwtAuthGuard will skip
 * authentication for that route.
 *
 * Usage:
 *   @Public()
 *   @Post('register')
 *   register(...) {}
 */
import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

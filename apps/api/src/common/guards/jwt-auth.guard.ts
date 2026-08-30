/**
 * JwtAuthGuard — wraps Passport's AuthGuard('jwt') strategy.
 *
 * Behaviour:
 *  - Protected by default: every route requires a valid JWT unless
 *    annotated with @Public().
 *  - Reads `isPublic` metadata set by the @Public() decorator.
 *
 * Source: https://docs.nestjs.com/security/authentication#implementing-the-authentication-guard
 */
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  override handleRequest<TUser>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw new UnauthorizedException(
        "Invalid or missing authentication token",
      );
    }
    return user;
  }
}

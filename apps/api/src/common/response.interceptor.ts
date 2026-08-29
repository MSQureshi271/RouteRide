/**
 * Response envelope interceptor.
 *
 * Wraps every successful handler return value in the TRD §5 envelope shape:
 *   { data: T, meta: { requestId: string, timestamp: string } }
 *
 * Source (NestJS interceptor pattern):
 *   https://docs.nestjs.com/interceptors#response-mapping
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { FastifyRequest } from "fastify";

export interface SuccessEnvelope<T> {
  data: T | null;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope<T>
> {
  intercept(
    ctx: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope<T>> {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    const requestId =
      (request.headers["x-request-id"] as string | undefined) ??
      (request as unknown as Record<string, string>)["requestId"] ??
      "unknown";

    return next.handle().pipe(
      map((data) => ({
        data: data ?? null,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}

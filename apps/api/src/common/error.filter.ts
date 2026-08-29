/**
 * Global exception filter — maps every thrown exception to the TRD §5.10 error contract.
 *
 * Error envelope shape:
 *   { error: { code: ErrorCode, message: string, details?: unknown },
 *     meta: { requestId: string } }
 *
 * Rules:
 *  - Never leaks stack traces or internal error messages to callers.
 *  - Unknown errors always produce 500 INTERNAL_ERROR.
 *  - requestId is always set on both the body and the x-request-id header.
 *
 * Source: https://docs.nestjs.com/exception-filters
 */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
interface HttpReply {
  status(code: number): this;
  header(name: string, value: string): this;
  send(payload: unknown): this;
}

interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
}

// ─── TRD §5.10 Error Codes ────────────────────────────────────────────────────

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId: string;
  };
}

// ─── HTTP Status → Error Code Map ─────────────────────────────────────────────

function resolveErrorCode(exception: unknown): {
  code: ErrorCode;
  status: number;
  details?: unknown;
} {
  if (exception instanceof ThrottlerException) {
    return { code: "RATE_LIMITED", status: HttpStatus.TOO_MANY_REQUESTS };
  }

  if (exception instanceof BadRequestException) {
    const response = exception.getResponse();
    return {
      code: "VALIDATION_ERROR",
      status: HttpStatus.BAD_REQUEST,
      details:
        typeof response === "object" && response !== null
          ? (response as Record<string, unknown>)["message"]
          : undefined,
    };
  }

  if (exception instanceof UnauthorizedException) {
    return { code: "UNAUTHENTICATED", status: HttpStatus.UNAUTHORIZED };
  }

  if (exception instanceof ForbiddenException) {
    return { code: "FORBIDDEN", status: HttpStatus.FORBIDDEN };
  }

  if (exception instanceof NotFoundException) {
    return { code: "NOT_FOUND", status: HttpStatus.NOT_FOUND };
  }

  if (exception instanceof ConflictException) {
    return { code: "CONFLICT", status: HttpStatus.CONFLICT };
  }

  if (exception instanceof UnprocessableEntityException) {
    return { code: "UNPROCESSABLE", status: HttpStatus.UNPROCESSABLE_ENTITY };
  }

  if (exception instanceof ServiceUnavailableException) {
    return {
      code: "SERVICE_UNAVAILABLE",
      status: HttpStatus.SERVICE_UNAVAILABLE,
    };
  }

  // All other HttpExceptions — map by status code
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === 429) return { code: "RATE_LIMITED", status };
    if (status === 503) return { code: "SERVICE_UNAVAILABLE", status };
    return { code: "INTERNAL_ERROR", status: HttpStatus.INTERNAL_SERVER_ERROR };
  }

  // Unknown — always 500, no detail leaked
  return { code: "INTERNAL_ERROR", status: HttpStatus.INTERNAL_SERVER_ERROR };
}

// ─── Safe user-facing messages (never leaks internal detail) ──────────────────

const CODE_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "The request data is invalid.",
  UNAUTHENTICATED: "Authentication is required.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  CONFLICT: "A conflict occurred with the current state of the resource.",
  UNPROCESSABLE: "The request was understood but could not be processed.",
  RATE_LIMITED: "Too many requests. Please slow down.",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",
  INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
};

// ─── Filter ───────────────────────────────────────────────────────────────────

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<HttpReply>();
    const request = ctx.getRequest<HttpRequest>();

    const requestId =
      (request.headers["x-request-id"] as string | undefined) ??
      (request as unknown as Record<string, string>)["requestId"] ??
      "unknown";

    const { code, status, details } = resolveErrorCode(exception);

    const body: ErrorEnvelope = {
      error: {
        code,
        message: CODE_MESSAGES[code],
        ...(details !== undefined ? { details } : {}),
      },
      meta: { requestId },
    };

    void reply.status(status).header("x-request-id", requestId).send(body);
  }
}

jest.mock("@nestjs/common", () => {
  class HttpException extends Error {
    constructor(
      readonly response: unknown,
      readonly status: number,
    ) {
      super(
        typeof response === "string"
          ? response
          : (response as { message?: string })?.message || "Http Exception",
      );
    }
    getResponse() {
      return this.response;
    }
    getStatus() {
      return this.status;
    }
  }
  return {
    Catch: () => (target: unknown) => target,
    HttpStatus: {
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      UNPROCESSABLE_ENTITY: 422,
      TOO_MANY_REQUESTS: 429,
      INTERNAL_SERVER_ERROR: 500,
      SERVICE_UNAVAILABLE: 503,
    },
    HttpException,
    BadRequestException: class extends HttpException {
      constructor(msg = "Bad Request") {
        super(msg, 400);
      }
    },
    UnauthorizedException: class extends HttpException {
      constructor(msg = "Unauthorized") {
        super(msg, 401);
      }
    },
    ForbiddenException: class extends HttpException {
      constructor(msg = "Forbidden") {
        super(msg, 403);
      }
    },
    NotFoundException: class extends HttpException {
      constructor(msg = "Not Found") {
        super(msg, 404);
      }
    },
    ConflictException: class extends HttpException {
      constructor(msg = "Conflict") {
        super(msg, 409);
      }
    },
    UnprocessableEntityException: class extends HttpException {
      constructor(msg = "Unprocessable") {
        super(msg, 422);
      }
    },
    ServiceUnavailableException: class extends HttpException {
      constructor(msg = "Service Unavailable") {
        super(msg, 503);
      }
    },
  };
});

jest.mock("@nestjs/throttler", () => ({
  ThrottlerException: class extends Error {
    constructor(msg = "ThrottlerException") {
      super(msg);
    }
  },
}));

import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  ServiceUnavailableException,
  ArgumentsHost,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { ErrorFilter, ErrorEnvelope } from "../src/common/error.filter.js";

describe("Error Contract & Exception Filter (TRD §5.10)", () => {
  let filter: ErrorFilter;

  beforeEach(() => {
    filter = new ErrorFilter();
  });

  function createMockHost(requestIdHeader?: string) {
    let capturedStatus = 0;
    const capturedHeaders: Record<string, string> = {};
    let capturedBody: ErrorEnvelope | null = null;

    const mockReply = {
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      header(name: string, value: string) {
        capturedHeaders[name.toLowerCase()] = value;
        return this;
      },
      send(body: ErrorEnvelope) {
        capturedBody = body;
        return this;
      },
    };

    const mockRequest = {
      headers: {
        ...(requestIdHeader ? { "x-request-id": requestIdHeader } : {}),
      },
    };

    const mockHost = {
      switchToHttp() {
        return {
          getResponse: () => mockReply,
          getRequest: () => mockRequest,
          getNext: () => ({}),
        };
      },
      getArgs: () => [],
      getArgByIndex: () => ({}),
      switchToRpc: () => ({}),
      switchToWs: () => ({}),
      getType: () => "http",
    } as unknown as ArgumentsHost;

    return {
      mockHost,
      getResult: () => ({
        status: capturedStatus,
        headers: capturedHeaders,
        body: capturedBody,
      }),
    };
  }

  it("maps BadRequestException to 400 VALIDATION_ERROR", () => {
    const { mockHost, getResult } = createMockHost("req-123");
    filter.catch(new BadRequestException("Invalid input"), mockHost);

    const { status, headers, body } = getResult();
    expect(status).toBe(400);
    expect(headers["x-request-id"]).toBe("req-123");
    expect(body?.error.code).toBe("VALIDATION_ERROR");
    expect(body?.meta.requestId).toBe("req-123");
  });

  it("maps UnauthorizedException to 401 UNAUTHENTICATED", () => {
    const { mockHost, getResult } = createMockHost("req-401");
    filter.catch(new UnauthorizedException(), mockHost);

    const { status, body } = getResult();
    expect(status).toBe(401);
    expect(body?.error.code).toBe("UNAUTHENTICATED");
  });

  it("maps ForbiddenException to 403 FORBIDDEN", () => {
    const { mockHost, getResult } = createMockHost("req-403");
    filter.catch(new ForbiddenException(), mockHost);

    const { status, body } = getResult();
    expect(status).toBe(403);
    expect(body?.error.code).toBe("FORBIDDEN");
  });

  it("maps NotFoundException to 404 NOT_FOUND", () => {
    const { mockHost, getResult } = createMockHost("req-404");
    filter.catch(new NotFoundException(), mockHost);

    const { status, body } = getResult();
    expect(status).toBe(404);
    expect(body?.error.code).toBe("NOT_FOUND");
  });

  it("maps ConflictException to 409 CONFLICT", () => {
    const { mockHost, getResult } = createMockHost("req-409");
    filter.catch(new ConflictException(), mockHost);

    const { status, body } = getResult();
    expect(status).toBe(409);
    expect(body?.error.code).toBe("CONFLICT");
  });

  it("maps UnprocessableEntityException to 422 UNPROCESSABLE", () => {
    const { mockHost, getResult } = createMockHost("req-422");
    filter.catch(new UnprocessableEntityException(), mockHost);

    const { status, body } = getResult();
    expect(status).toBe(422);
    expect(body?.error.code).toBe("UNPROCESSABLE");
  });

  it("maps ThrottlerException to 429 RATE_LIMITED", () => {
    const { mockHost, getResult } = createMockHost("req-429");
    filter.catch(new ThrottlerException(), mockHost);

    const { status, body } = getResult();
    expect(status).toBe(429);
    expect(body?.error.code).toBe("RATE_LIMITED");
  });

  it("maps ServiceUnavailableException to 503 SERVICE_UNAVAILABLE", () => {
    const { mockHost, getResult } = createMockHost("req-503");
    filter.catch(new ServiceUnavailableException(), mockHost);

    const { status, body } = getResult();
    expect(status).toBe(503);
    expect(body?.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("maps unknown Error to 500 INTERNAL_ERROR without leaking stack or internal details", () => {
    const { mockHost, getResult } = createMockHost("req-500");
    const secretError = new Error(
      "Database password was incorrect: postgresql://secret@db",
    );
    filter.catch(secretError, mockHost);

    const { status, body } = getResult();
    expect(status).toBe(500);
    expect(body?.error.code).toBe("INTERNAL_ERROR");
    expect(body?.error.message).toBe(
      "An unexpected error occurred. Please try again later.",
    );

    // Ensure zero stack or internal text leaked in output
    const jsonString = JSON.stringify(body);
    expect(jsonString).not.toContain("Database password");
    expect(jsonString).not.toContain("secret@db");
    expect(jsonString).not.toContain("stack");
    expect(jsonString).not.toContain("Error:");
  });
});

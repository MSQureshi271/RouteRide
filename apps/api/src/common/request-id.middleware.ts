/**
 * Request-ID middleware.
 *
 * Reads the `x-request-id` header (if present) or generates a UUID v4.
 * Attaches it to `req.requestId` and sets `x-request-id` on the response
 * so callers can correlate logs and traces.
 *
 * Applied globally in AppModule.configure().
 */
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { v4 as uuidv4 } from "uuid";

// Extend FastifyRequest to carry requestId through the chain
declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    req: FastifyRequest["raw"],
    res: FastifyReply["raw"],
    next: () => void,
  ): void {
    const incomingId = (
      req.headers?.["x-request-id"] as string | undefined
    )?.trim();
    const requestId =
      incomingId && incomingId.length > 0 ? incomingId : uuidv4();

    // Attach to the raw node request so downstream code can read it
    (req as unknown as Record<string, unknown>)["requestId"] = requestId;

    // Reflect back on the response
    res.setHeader("x-request-id", requestId);

    next();
  }
}

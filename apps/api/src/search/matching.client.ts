/**
 * MatchingClient — HTTP proxy client communicating with the Python matching microservice (T1.08).
 *
 * Implements:
 *  - POST /internal/v1/matching/search (AD-5 versioned contract)
 *  - Explicit Undici Agent transport with 1000ms TCP connection timeout
 *  - Dynamically budgeted response headers & body read timeout
 *  - Parent AbortSignal coordination (honouring the overall gateway response deadline)
 *  - W3C traceparent and X-Request-ID propagation
 *  - Retries explicitly disabled on search (AD-12)
 *  - 503 ServiceUnavailableException with Retry-After: 30 on timeouts or connection failures
 */
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Agent, fetch as undiciFetch } from "undici";
import { propagation, context } from "@opentelemetry/api";
import { getEnv } from "@routeride/config";
import { ServiceUnavailableWithRetryException } from "../common/service-unavailable-retry.exception.js";
import type {
  InternalSearchRequest,
  InternalSearchResponse,
  InternalDiscoveryRequestV2,
  InternalDiscoveryResponseV2,
} from "@routeride/contracts";
import { InternalDiscoveryResponseV2Schema } from "@routeride/contracts";

@Injectable()
export class MatchingClient {
  private readonly logger = new Logger(MatchingClient.name);

  async search(
    request: InternalSearchRequest,
    timeoutMs: number,
    parentSignal?: AbortSignal,
    requestId?: string,
  ): Promise<InternalSearchResponse> {
    return (await this.send(
      request,
      "/internal/v1/matching/search",
      timeoutMs,
      parentSignal,
      requestId,
    )) as InternalSearchResponse;
  }

  async discover(
    request: InternalDiscoveryRequestV2,
    timeoutMs: number,
    parentSignal?: AbortSignal,
    requestId?: string,
  ): Promise<InternalDiscoveryResponseV2> {
    const raw = await this.send(
      request,
      "/internal/v2/matching/search",
      timeoutMs,
      parentSignal,
      requestId,
    );
    const parsed = InternalDiscoveryResponseV2Schema.safeParse(raw);
    if (!parsed.success)
      throw new ServiceUnavailableWithRetryException(
        "Invalid matching response",
        30,
      );
    return parsed.data;
  }

  private async send(
    request: unknown,
    path: string,
    timeoutMs: number,
    parentSignal?: AbortSignal,
    requestId?: string,
  ): Promise<unknown> {
    const baseUrl = getEnv().MATCHING_SERVICE_URL.replace(/\/$/, "");
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (requestId) {
      headers["X-Request-ID"] = requestId;
    }
    propagation.inject(context.active(), headers);

    const dispatcher = new Agent({
      connect: {
        timeout: 1000, // Explicit 1000ms TCP connect timeout
      },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal =
      parentSignal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([parentSignal, timeoutSignal])
        : timeoutSignal;

    try {
      const response = await undiciFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        dispatcher,
        signal,
      });

      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 422) {
          throw new UnprocessableEntityException("Invalid route request");
        }
        this.logger.warn({
          event: "matching.upstream_http_error",
          status: response.status,
        });
        throw new ServiceUnavailableWithRetryException(
          "Matching engine returned upstream error",
          30,
        );
      }

      const data: unknown = await response.json();
      return data;
    } catch (err: unknown) {
      if (
        err instanceof ServiceUnavailableException ||
        err instanceof UnprocessableEntityException
      ) {
        throw err;
      }
      this.logger.warn({
        event: "matching.upstream_failure",
        error: String(err),
      });
      throw new ServiceUnavailableWithRetryException(
        "Matching engine unavailable",
        30,
      );
    } finally {
      void dispatcher.close().catch(() => {});
    }
  }
}

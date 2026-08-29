/**
 * Prometheus RED metrics.
 *
 * Registers three histograms and a MetricsInterceptor that auto-instruments
 * every HTTP request. All label values are bounded to prevent cardinality explosion.
 *
 * Metrics exposed:
 *  - http_request_duration_seconds  (method, route, status_class)
 *  - db_operation_duration_seconds  (operation)
 *  - external_dep_duration_seconds  (service)
 *
 * Source: https://github.com/siimon/prom-client
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Histogram, Registry, collectDefaultMetrics } from "prom-client";
interface RequestWithRouterPath {
  method?: string;
  url?: string;
  routerPath?: string;
}

// ─── Singleton Registry ───────────────────────────────────────────────────────

export const metricsRegistry = new Registry();

// Collect default Node.js metrics (memory, CPU, event-loop lag, etc.)
collectDefaultMetrics({ register: metricsRegistry });

// ─── Bounded Label Values ─────────────────────────────────────────────────────

const ALLOWED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
type HttpMethod = (typeof ALLOWED_METHODS)[number] | "UNKNOWN";

const _ALLOWED_SERVICES = [
  "db",
  "redis",
  "stripe",
  "fcm",
  "maps",
  "s3",
] as const;
type ExternalService = (typeof _ALLOWED_SERVICES)[number];

const _ALLOWED_DB_OPS = ["query", "execute", "transaction"] as const;
type DbOperation = (typeof _ALLOWED_DB_OPS)[number];

function sanitiseMethod(raw: string | undefined): HttpMethod {
  const upper = (raw ?? "").toUpperCase() as HttpMethod;
  return ALLOWED_METHODS.includes(upper as (typeof ALLOWED_METHODS)[number])
    ? upper
    : "UNKNOWN";
}

function statusClass(code: number): "2xx" | "3xx" | "4xx" | "5xx" | "unknown" {
  if (code >= 200 && code < 300) return "2xx";
  if (code >= 300 && code < 400) return "3xx";
  if (code >= 400 && code < 500) return "4xx";
  if (code >= 500) return "5xx";
  return "unknown";
}

// ─── Histograms ───────────────────────────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds (method, route template, status class)",
  labelNames: ["method", "route", "status_class"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const dbOperationDuration = new Histogram({
  name: "db_operation_duration_seconds",
  help: "Duration of database operations in seconds",
  labelNames: ["operation"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [metricsRegistry],
});

export const externalDepDuration = new Histogram({
  name: "external_dep_duration_seconds",
  help: "Duration of calls to external dependencies (stripe, fcm, maps, s3, db, redis)",
  labelNames: ["service"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

// ─── Measurement Helpers ──────────────────────────────────────────────────────

/** Call before a DB operation to get a timer. Finish with `end()`. */
export function measureDb(operation: DbOperation = "query"): () => void {
  return dbOperationDuration.startTimer({ operation });
}

/** Call before an external service call to get a timer. */
export function measureExternal(service: ExternalService): () => void {
  return externalDepDuration.startTimer({ service });
}

// ─── MetricsInterceptor ───────────────────────────────────────────────────────

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = ctx.switchToHttp().getRequest<RequestWithRouterPath>();
    const method = sanitiseMethod(request.method);

    // Use the route template (e.g. /users/:id), NOT the raw URL
    // Fastify stores this in request.routerPath
    const routerPath = (request as unknown as Record<string, unknown>)[
      "routerPath"
    ] as string | undefined;
    const route =
      routerPath ??
      request.url?.split("?")[0]?.replace(/\/[0-9a-f-]{8,}/gi, "/:id") ??
      "unknown";

    const end = httpRequestDuration.startTimer({ method, route });

    return next.handle().pipe(
      tap({
        next: () => {
          const reply = ctx
            .switchToHttp()
            .getResponse<{ statusCode: number }>();
          end({ status_class: statusClass(reply.statusCode) });
        },
        error: () => {
          end({ status_class: "5xx" });
        },
      }),
    );
  }
}

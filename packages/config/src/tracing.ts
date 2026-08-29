/**
 * OpenTelemetry Node SDK initialization.
 *
 * Configures:
 *  - Auto-instrumentations for HTTP, Express/Fastify, Redis, pg, etc.
 *  - OTLP HTTP trace exporter (if OTEL_EXPORTER_OTLP_ENDPOINT is configured)
 *  - Traceparent W3C context propagation
 *  - Resource detectors with service.name
 *
 * Must be imported before any other module in application entrypoints.
 *
 * Source: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

const isProduction = process.env["NODE_ENV"] === "production";
const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];

if (process.env["OTEL_DIAGNOSTICS"] === "true") {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

let sdk: NodeSDK | null = null;

export function initTracing(serviceName = "routeride-api"): NodeSDK | null {
  if (sdk) return sdk;

  // If no exporter endpoint in development/test, keep tracing local/no-op
  const traceExporter = otlpEndpoint
    ? new OTLPTraceExporter({
        url: otlpEndpoint.endsWith("/v1/traces")
          ? otlpEndpoint
          : `${otlpEndpoint.replace(/\/$/, "")}/v1/traces`,
      })
    : undefined;

  sdk = new NodeSDK({
    serviceName,
    ...(traceExporter ? { traceExporter } : {}),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation to reduce noise
        "@opentelemetry/instrumentation-fs": {
          enabled: false,
        },
      }),
    ],
  });

  try {
    sdk.start();
    if (!isProduction && process.env["NODE_ENV"] !== "test") {
      process.stdout.write(
        `🔭 OpenTelemetry tracing initialized for service: ${serviceName}\n`,
      );
    }
  } catch (err) {
    process.stderr.write(
      `⚠️ Failed to start OpenTelemetry SDK: ${String(err)}\n`,
    );
  }

  process.on("SIGTERM", () => {
    sdk
      ?.shutdown()
      .then(() => process.stdout.write("OpenTelemetry SDK terminated\n"))
      .catch((err) =>
        process.stderr.write(
          `Error terminating OpenTelemetry SDK: ${String(err)}\n`,
        ),
      );
  });

  return sdk;
}

// Auto-run if imported directly
if (process.env["NODE_ENV"] !== "test") {
  initTracing(process.env["OTEL_SERVICE_NAME"] || "routeride-api");
}

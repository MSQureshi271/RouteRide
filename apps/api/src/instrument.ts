/**
 * Sentry instrumentation — MUST be the very first import in main.ts.
 * Source: https://docs.sentry.io/platforms/javascript/guides/nestjs/
 *
 * Initialises error tracking and performance monitoring.
 * No-ops gracefully if SENTRY_DSN is not set (dev/test environments).
 */
import * as Sentry from "@sentry/nestjs";

const dsn = process.env["SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env["NODE_ENV"] === "production" ? 0.1 : 1.0,
    environment: process.env["NODE_ENV"] ?? "development",
    // Never send raw PII — coordinates, phone numbers, etc. are redacted at
    // the logger layer. Sentry only gets stack traces and structured breadcrumbs.
    sendDefaultPii: false,
  });
}

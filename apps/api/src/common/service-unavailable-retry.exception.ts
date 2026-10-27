import { ServiceUnavailableException } from "@nestjs/common";

export class ServiceUnavailableWithRetryException extends ServiceUnavailableException {
  readonly headers: Record<string, string>;

  constructor(
    message = "Service temporarily unavailable",
    retryAfterSeconds = 30,
  ) {
    super(message);
    this.headers = { "Retry-After": String(retryAfterSeconds) };
  }
}

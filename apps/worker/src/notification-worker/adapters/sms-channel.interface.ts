/**
 * SmsChannel interface — abstract SMS delivery.
 *
 * A concrete SMS provider (Vonage, Messagebird, Twilio, etc.) is
 * plugged in by creating a class that implements this interface and
 * providing it to NestJS's DI as the SMS_CHANNEL token.
 *
 * The DevSmsAdapter (below) is the default: it logs to stdout for
 * local development without any paid provider dependency.
 */
import type {
  DeliveryPayload,
  NotificationChannel,
} from "./notification-channel.interface";
import { Injectable } from "@nestjs/common";

export interface SmsChannel extends NotificationChannel {
  /** Provider name — used in log messages */
  readonly providerName: string;
}

/**
 * DevSmsAdapter — writes SMS payloads to stdout.
 * Used in development and CI where no provider credentials are available.
 * Replace by binding a real SmsChannel implementation in the module.
 */
@Injectable()
export class DevSmsAdapter implements SmsChannel {
  readonly providerName = "dev-console";

  async send(payload: DeliveryPayload): Promise<void> {
    console.log(`[SMS:${this.providerName}] → ${payload.phone}`);
    console.log(`  Message: ${payload.body}`);
    // No external call — returns immediately
  }
}

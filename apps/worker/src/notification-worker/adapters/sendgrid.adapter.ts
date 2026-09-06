/**
 * SendGrid email notification channel adapter.
 *
 * Delivers email notifications via @sendgrid/mail.
 * Falls back to console simulation if SENDGRID_API_KEY is not configured.
 */
import { Injectable, Logger } from "@nestjs/common";
import sgMail from "@sendgrid/mail";
import type {
  DeliveryPayload,
  NotificationChannel,
} from "./notification-channel.interface";

@Injectable()
export class SendgridAdapter implements NotificationChannel {
  private readonly logger = new Logger(SendgridAdapter.name);
  private initialized = false;
  private readonly fromEmail =
    process.env["SENDGRID_FROM_EMAIL"] || "no-reply@routeride.com";

  constructor() {
    const apiKey = process.env["SENDGRID_API_KEY"];
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.initialized = true;
    } else {
      this.logger.warn(
        "SENDGRID_API_KEY not configured. Email notifications will be simulated.",
      );
    }
  }

  async send(payload: DeliveryPayload): Promise<void> {
    if (!payload.email) {
      this.logger.debug(`No email address provided for user ${payload.userId}`);
      return;
    }

    if (!this.initialized) {
      this.logger.log(
        `[SENDGRID:SIMULATED] To: ${payload.email} Subject: ${payload.title}`,
      );
      return;
    }

    try {
      await sgMail.send({
        to: payload.email,
        from: this.fromEmail,
        subject: payload.title,
        text: payload.body,
        html: `<p>${payload.body}</p>`,
      });
      this.logger.debug(`Email sent successfully to ${payload.email}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${payload.email}`, error);
      throw error;
    }
  }
}

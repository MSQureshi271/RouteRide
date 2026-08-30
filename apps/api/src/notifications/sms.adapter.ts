/**
 * SMS Adapter — interface and implementations for sending OTP text messages.
 *
 * Interface: SmsAdapter
 *   Implementations:
 *     - ConsoleSmsAdapter  — logs OTP to stdout; always active in dev/test
 *     - TwilioSmsAdapter   — sends real SMS via Twilio; used in production
 *                            when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN are set
 *
 * CURRENT STATUS: ConsoleSmsAdapter is always selected.
 * TwilioSmsAdapter code is present for future wiring but NOT used yet.
 * To enable Twilio: set the three TWILIO_* env vars and switch the
 * factory in auth.module.ts from ConsoleSmsAdapter to TwilioSmsAdapter.
 */
import { Injectable, Logger } from "@nestjs/common";

// ─── Interface ────────────────────────────────────────────────────────────────

export abstract class SmsAdapter {
  abstract send(to: string, body: string): Promise<void>;
}

// ─── Console adapter (dev / test) ─────────────────────────────────────────────

@Injectable()
export class ConsoleSmsAdapter extends SmsAdapter {
  private readonly logger = new Logger(ConsoleSmsAdapter.name);

  async send(to: string, body: string): Promise<void> {
    // Never log the OTP in production — ConsoleSmsAdapter is dev-only
    this.logger.log(`[SMS → ${to}]: ${body}`);
  }
}

// ─── Twilio adapter (production) ──────────────────────────────────────────────
// Intentionally NOT wired to AuthModule until Twilio credentials are available.
// When ready, import Twilio, inject env vars, and swap in auth.module.ts.

@Injectable()
export class TwilioSmsAdapter extends SmsAdapter {
  private readonly logger = new Logger(TwilioSmsAdapter.name);
  private readonly from: string;

  /**
   * @param accountSid - TWILIO_ACCOUNT_SID
   * @param authToken  - TWILIO_AUTH_TOKEN
   * @param from       - TWILIO_PHONE_FROM (E.164 format)
   *
   * NOTE: Not yet active. Wiring requires:
   *  1. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_FROM in env
   *  2. Replace ConsoleSmsAdapter with TwilioSmsAdapter in auth.module.ts
   *  3. Inject Twilio client here via constructor
   */
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    from: string,
  ) {
    super();
    this.from = from;
    this.logger.warn(
      "TwilioSmsAdapter instantiated but NOT YET ACTIVE — using stub implementation",
    );
  }

  async send(to: string, _body: string): Promise<void> {
    // TODO: Replace with real Twilio client call when credentials are set.
    // Example:
    //   const twilio = require('twilio');
    //   const client = twilio(this.accountSid, this.authToken);
    //   await client.messages.create({ to, from: this.from, body: _body });
    this.logger.warn(
      `TwilioSmsAdapter.send called for ${to} but Twilio is not yet enabled`,
    );
    void this.accountSid; // suppress unused-var lint
    void this.authToken;
    void this.from;
  }
}

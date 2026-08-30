/**
 * OtpService — Redis-backed one-time password for phone verification.
 *
 * Redis key schema:
 *   otp:hash:{phone}     → SHA-256 hex of the 6-digit code   (TTL: 5 min)
 *   otp:attempts:{phone} → attempt counter                   (TTL: 5 min)
 *   otp:lockout:{phone}  → lockout marker (value: "1")       (TTL: 15 min)
 *
 * Rules (TRD §auth):
 *  - OTP is a 6-digit numeric string.
 *  - Stored only as SHA-256 hash — plaintext is NEVER persisted.
 *  - Max 3 attempts; 4th attempt during lockout is rejected even with correct code.
 *  - On success: user status transitions to ACTIVE, all OTP keys are cleared.
 *  - OTP code must NOT appear in any log line (verified by test).
 *
 * Adapter: SmsAdapter (ConsoleSmsAdapter in dev, TwilioSmsAdapter in prod).
 */
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomInt } from "node:crypto";
import type { Redis } from "ioredis";
import { PrismaService } from "../prisma/prisma.service.js";
import { SmsAdapter } from "../notifications/sms.adapter.js";

const OTP_TTL_SECONDS = 300; // 5 minutes
const LOCKOUT_TTL_SECONDS = 900; // 15 minutes
const MAX_ATTEMPTS = 3;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject("REDIS_CLIENT") private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly sms: SmsAdapter,
  ) {}

  // ─── Send OTP ──────────────────────────────────────────────────────────────

  /**
   * Generates a 6-digit OTP, stores its SHA-256 hash in Redis, and sends
   * the plaintext via the SMS adapter.
   *
   * The OTP plaintext is NEVER logged — only the redacted placeholder is.
   */
  async sendOtp(phone: string): Promise<void> {
    const code = generateOtp();
    const hash = sha256(code);

    const hashKey = otpHashKey(phone);
    const attemptsKey = otpAttemptsKey(phone);

    // Store hash + reset attempt counter
    await this.redis.setex(hashKey, OTP_TTL_SECONDS, hash);
    await this.redis.del(attemptsKey);

    this.logger.log({ event: "otp.sent", phone, code: "[REDACTED]" });

    // Send the plaintext code via the SMS adapter
    await this.sms.send(phone, `Your RouteRide verification code is: ${code}`);
  }

  // ─── Verify OTP ────────────────────────────────────────────────────────────

  /**
   * Verifies a submitted OTP code against the stored hash.
   * On success: transitions user to ACTIVE, clears all OTP keys.
   * On failure: increments attempt counter; locks after MAX_ATTEMPTS.
   */
  async verifyOtp(phone: string, code: string): Promise<void> {
    const lockoutKey = otpLockoutKey(phone);
    const isLocked = await this.redis.exists(lockoutKey);
    if (isLocked) {
      throw new UnauthorizedException(
        "Too many failed attempts. Please wait 15 minutes before trying again.",
      );
    }

    const hashKey = otpHashKey(phone);
    const storedHash = await this.redis.get(hashKey);

    if (!storedHash) {
      throw new UnauthorizedException(
        "OTP has expired or was not sent. Please request a new one.",
      );
    }

    const attemptsKey = otpAttemptsKey(phone);
    const attemptCount = await this.redis.incr(attemptsKey);

    if (attemptCount === 1) {
      // First increment — set TTL to match the OTP TTL
      await this.redis.expire(attemptsKey, OTP_TTL_SECONDS);
    }

    const submittedHash = sha256(code);
    if (submittedHash !== storedHash) {
      if (attemptCount >= MAX_ATTEMPTS) {
        // Lock the phone for 15 minutes
        await this.redis.setex(lockoutKey, LOCKOUT_TTL_SECONDS, "1");
        await this.redis.del(hashKey, attemptsKey);
        throw new UnauthorizedException(
          "Maximum verification attempts exceeded. Please wait 15 minutes.",
        );
      }

      const remaining = MAX_ATTEMPTS - attemptCount;
      throw new UnauthorizedException(
        `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      );
    }

    // ── Success ────────────────────────────────────────────────────────────
    // Clear OTP keys
    await this.redis.del(hashKey, attemptsKey, lockoutKey);

    // Transition user to ACTIVE
    await this.prisma.sql`
      UPDATE users
      SET status = 'ACTIVE'::user_status
      WHERE phone = ${phone} AND status = 'PENDING_VERIFICATION'::user_status
    `;

    this.logger.log({ event: "otp.verified", phone });
  }

  // ─── Reset OTP (for password reset flow) ─────────────────────────────────

  /**
   * Sends a password-reset OTP. Identical to sendOtp in implementation;
   * uses a dedicated key prefix to separate from registration OTPs.
   */
  async sendResetOtp(phone: string): Promise<void> {
    const code = generateOtp();
    const hash = sha256(code);

    const hashKey = resetHashKey(phone);
    const attemptsKey = resetAttemptsKey(phone);

    await this.redis.setex(hashKey, OTP_TTL_SECONDS, hash);
    await this.redis.del(attemptsKey);

    this.logger.log({ event: "otp.reset.sent", phone, code: "[REDACTED]" });

    await this.sms.send(
      phone,
      `Your RouteRide password reset code is: ${code}`,
    );
  }

  /**
   * Verifies a password-reset OTP.
   * On success: clears keys. Does NOT change user status.
   * Caller (PasswordResetService) is responsible for updating the password.
   */
  async verifyResetOtp(phone: string, code: string): Promise<void> {
    const lockoutKey = otpLockoutKey(`reset:${phone}`);
    const isLocked = await this.redis.exists(lockoutKey);
    if (isLocked) {
      throw new UnauthorizedException(
        "Too many failed attempts. Please wait 15 minutes before trying again.",
      );
    }

    const hashKey = resetHashKey(phone);
    const storedHash = await this.redis.get(hashKey);

    if (!storedHash) {
      throw new UnauthorizedException(
        "Reset code has expired or was not requested.",
      );
    }

    const attemptsKey = resetAttemptsKey(phone);
    const attemptCount = await this.redis.incr(attemptsKey);
    if (attemptCount === 1) {
      await this.redis.expire(attemptsKey, OTP_TTL_SECONDS);
    }

    const submittedHash = sha256(code);
    if (submittedHash !== storedHash) {
      if (attemptCount >= MAX_ATTEMPTS) {
        await this.redis.setex(lockoutKey, LOCKOUT_TTL_SECONDS, "1");
        await this.redis.del(hashKey, attemptsKey);
        throw new UnauthorizedException(
          "Maximum reset attempts exceeded. Please wait 15 minutes.",
        );
      }
      const remaining = MAX_ATTEMPTS - attemptCount;
      throw new UnauthorizedException(
        `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      );
    }

    // Success — clear keys
    await this.redis.del(hashKey, attemptsKey, lockoutKey);
    this.logger.log({ event: "otp.reset.verified", phone });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOtp(): string {
  return randomInt(100_000, 1_000_000).toString();
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function otpHashKey(phone: string): string {
  return `otp:hash:${phone}`;
}

function otpAttemptsKey(phone: string): string {
  return `otp:attempts:${phone}`;
}

function otpLockoutKey(phone: string): string {
  return `otp:lockout:${phone}`;
}

function resetHashKey(phone: string): string {
  return `otp:reset:hash:${phone}`;
}

function resetAttemptsKey(phone: string): string {
  return `otp:reset:attempts:${phone}`;
}

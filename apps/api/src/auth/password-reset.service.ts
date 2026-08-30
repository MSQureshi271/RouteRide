/**
 * PasswordResetService — phone-OTP-based password reset flow.
 *
 * Rules (T0.30):
 *  - POST /auth/forgot-password: identical response whether or not phone exists
 *    (prevents account enumeration via timing or body differences).
 *  - POST /auth/reset-password: verifies OTP, hashes new password, revokes ALL
 *    refresh tokens for the user (forces re-login on all devices).
 *  - The OTP used here is issued via OtpService.sendResetOtp and verified via
 *    OtpService.verifyResetOtp (separate Redis key namespace from registration).
 *
 * Timing safety:
 *  - forgotPassword always performs a bcrypt hash (cost 12) on a constant string
 *    for non-existent phones so the response time is indistinguishable.
 */
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { hash } from "bcrypt";
import { PrismaService } from "../prisma/prisma.service.js";
import { OtpService } from "./otp.service.js";
import { TokenService } from "./token.service.js";

const BCRYPT_ROUNDS = 12;
const TIMING_DUMMY = "timing-protection-constant-string";

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
  ) {}

  // ─── Initiate password reset ───────────────────────────────────────────────

  /**
   * Sends a reset OTP to the phone number.
   * Response is IDENTICAL whether or not the phone is registered —
   * prevents account enumeration.
   */
  async initiate(phone: string): Promise<{ message: string }> {
    const userRows = (await this.prisma.sql`
      SELECT id FROM users WHERE phone = ${phone} LIMIT 1
    `) as unknown as { id: string }[];

    const user = userRows[0];

    if (user) {
      // Real account — send the OTP
      await this.otpService.sendResetOtp(phone);
    } else {
      // No account — perform a dummy bcrypt hash to equalise response time
      await hash(TIMING_DUMMY, BCRYPT_ROUNDS);
      this.logger.log({ event: "password.reset.noop", phone });
    }

    // Identical response regardless of whether account exists
    return {
      message:
        "If an account with that phone number exists, a reset code has been sent.",
    };
  }

  // ─── Complete password reset ───────────────────────────────────────────────

  async complete(
    phone: string,
    otpCode: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // Verify the reset OTP (throws on invalid/expired/locked)
    await this.otpService.verifyResetOtp(phone, otpCode);

    const userRows = (await this.prisma.sql`
      SELECT id FROM users WHERE phone = ${phone} LIMIT 1
    `) as unknown as { id: string }[];

    const user = userRows[0];
    if (!user) {
      throw new UnauthorizedException("Account not found");
    }

    const newHash = await hash(newPassword, BCRYPT_ROUNDS);

    // Update password and revoke ALL active sessions (force re-login)
    await this.prisma.sql`
      UPDATE users
      SET password_hash = ${newHash}
      WHERE id = ${user.id}::uuid
    `;

    await this.tokenService.revokeAllForUser(user.id);

    this.logger.log({ event: "password.reset.completed", userId: user.id });

    return {
      message:
        "Password reset successful. Please log in with your new password.",
    };
  }
}

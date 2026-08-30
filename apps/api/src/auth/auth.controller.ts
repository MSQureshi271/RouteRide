/**
 * AuthController — all authentication endpoints.
 *
 * Route prefix: /auth (global prefix /api/v1 is set in main.ts)
 *
 * All endpoints are @Public() by default for the unauthenticated flows.
 * Authenticated flows (logout, profile) use @UseGuards(JwtAuthGuard).
 *
 * Rate limiting is applied via the guards already registered in AppModule:
 *  - Auth endpoints (register, login, forgot-password): AuthRateLimitGuard (5/IP/10min)
 *  - OTP endpoints: OtpRateLimitGuard (3/phone/5min)
 *  - General: GeneralRateLimitGuard (200/user/1min, applied globally)
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  RegisterRequestSchema,
  VerifyOtpRequestSchema,
  LoginRequestSchema,
  RefreshTokenRequestSchema,
  GoogleAuthRequestSchema,
  SendOtpRequestSchema,
} from "@routeride/contracts";
import { AuthService } from "./auth.service.js";
import { OtpService } from "./otp.service.js";
import { TokenService } from "./token.service.js";
import { GoogleService } from "./google.service.js";
import { PasswordResetService } from "./password-reset.service.js";
import { Public } from "../common/decorators/public.decorator.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../common/decorators/current-user.decorator.js";
import { AuthRateLimitGuard, OtpRateLimitGuard } from "../common/rate-limit.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const ForgotPasswordSchema = z
  .object({
    phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Must be E.164"),
  })
  .strict();

const ResetPasswordSchema = z
  .object({
    phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Must be E.164"),
    code: z.string().length(6),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly googleService: GoogleService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  // ─── Registration (T0.25) ─────────────────────────────────────────────────

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown) {
    const parsed = RegisterRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.register(parsed.data);
  }

  // ─── OTP (T0.26) ──────────────────────────────────────────────────────────

  @Public()
  @UseGuards(OtpRateLimitGuard)
  @Post("otp/send")
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() body: unknown) {
    const parsed = SendOtpRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.otpService.sendOtp(parsed.data.phone);
    return { message: "Verification code sent." };
  }

  @Public()
  @UseGuards(OtpRateLimitGuard)
  @Post("otp/verify")
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() body: unknown) {
    const parsed = VerifyOtpRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.otpService.verifyOtp(parsed.data.phone, parsed.data.code);
    return { message: "Phone number verified. Account is now active." };
  }

  // ─── Login / Tokens (T0.27) ───────────────────────────────────────────────

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown) {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.login(parsed.data);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown) {
    const parsed = RefreshTokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.tokenService.refresh(parsed.data.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() _user: JwtPayload, @Body() body: unknown) {
    const parsed = RefreshTokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.tokenService.logout(parsed.data.refreshToken);
    return { message: "Logged out successfully." };
  }

  // ─── Google OAuth (T0.28) ─────────────────────────────────────────────────

  @Public()
  @Post("oauth/google")
  @HttpCode(HttpStatus.OK)
  async googleAuth(@Body() body: unknown) {
    const parsed = GoogleAuthRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.googleService.verifyAndUpsert(
      parsed.data.idToken,
      parsed.data.role,
    );
  }

  // ─── Password Reset (T0.30) ───────────────────────────────────────────────

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: unknown) {
    const parsed = ForgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.passwordResetService.initiate(parsed.data.phone);
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: unknown) {
    const parsed = ResetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.passwordResetService.complete(
      parsed.data.phone,
      parsed.data.code,
      parsed.data.newPassword,
    );
  }
}

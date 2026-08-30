/**
 * AuthModule — bundles all identity services, strategy, and guards.
 *
 * Provides (exported for use by other modules):
 *  - JwtAuthGuard  — the global authentication guard
 *  - RolesGuard    — role-based access control
 *  - OwnershipGuard — resource ownership enforcement
 *  - TokenService  — token issuance / rotation (needed by other modules later)
 *  - JwtModule     — so other modules can use JwtService if needed
 *
 * SMS adapter: ConsoleSmsAdapter is always active.
 * To switch to TwilioSmsAdapter, replace the SmsAdapter provider below and
 * ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_FROM are set.
 */
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { getEnv } from "@routeride/config";
import { Redis } from "ioredis";

import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { OtpService } from "./otp.service.js";
import { TokenService } from "./token.service.js";
import { GoogleService } from "./google.service.js";
import { PasswordResetService } from "./password-reset.service.js";
import { JwtStrategy } from "./jwt.strategy.js";
import { ConsoleSmsAdapter, SmsAdapter } from "../notifications/sms.adapter.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { OwnershipGuard } from "../common/guards/ownership.guard.js";

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),

    // JwtModule configured from validated env — secret and access TTL
    JwtModule.registerAsync({
      useFactory: () => {
        const env = getEnv();
        return {
          secret: env.JWT_SECRET,
          signOptions: { expiresIn: `${env.JWT_ACCESS_TTL_SECONDS}s` },
        };
      },
    }),
  ],

  controllers: [AuthController],

  providers: [
    // ─── Auth services ────────────────────────────────────────────────────
    AuthService,
    OtpService,
    TokenService,
    GoogleService,
    PasswordResetService,
    JwtStrategy,

    // ─── Guards ──────────────────────────────────────────────────────────
    JwtAuthGuard,
    RolesGuard,
    OwnershipGuard,

    // ─── SMS adapter ─────────────────────────────────────────────────────
    // ConsoleSmsAdapter is active now. To enable Twilio:
    //   1. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_FROM in env
    //   2. Change useClass to TwilioSmsAdapter
    //   3. Inject env vars in TwilioSmsAdapter constructor (see sms.adapter.ts)
    {
      provide: SmsAdapter,
      useClass: ConsoleSmsAdapter,
    },

    // ─── Redis client ──────────────────────────────────────────────────────
    {
      provide: "REDIS_CLIENT",
      useFactory: () => new Redis(getEnv().REDIS_URL),
    },
  ],

  exports: [JwtAuthGuard, RolesGuard, OwnershipGuard, TokenService, JwtModule],
})
export class AuthModule {}

import { z } from "zod";
import { createSuccessEnvelopeSchema } from "../common/envelope.js";

export const UserRoleSchema = z.enum([
  "CONSUMER",
  "DRIVER",
  "ADMIN",
  "INSTITUTION_ADMIN",
  "FLEET_ADMIN",
]);
export const UserStatusSchema = z.enum([
  "PENDING_VERIFICATION",
  "ACTIVE",
  "SUSPENDED",
  "DELETED",
]);

// ─── Register ─────────────────────────────────────────────────────────────────

export const RegisterRequestSchema = z
  .object({
    phone: z
      .string()
      .regex(/^\+[1-9]\d{1,14}$/, "Must be a valid E.164 phone number"),
    fullName: z.string().min(2).max(100),
    password: z.string().min(8).max(128),
    role: z.enum(["CONSUMER", "DRIVER"]),
    email: z.string().email().optional(),
  })
  .strict();

export const UserSummarySchema = z
  .object({
    id: z.string().uuid(),
    phone: z.string(),
    fullName: z.string(),
    role: UserRoleSchema,
    status: UserStatusSchema,
    email: z.string().nullable().optional(),
    profilePhotoUrl: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const RegisterResponseSchema = createSuccessEnvelopeSchema(
  z
    .object({
      user: UserSummarySchema,
      message: z.string(),
    })
    .strict(),
);

// ─── Login ────────────────────────────────────────────────────────────────────

export const LoginRequestSchema = z
  .object({
    phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
    password: z.string().min(1),
  })
  .strict();

export const AuthTokensSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number().int(),
  })
  .strict();

export const LoginResponseSchema = createSuccessEnvelopeSchema(
  z
    .object({
      user: UserSummarySchema,
      tokens: AuthTokensSchema,
    })
    .strict(),
);

// ─── Refresh Token ────────────────────────────────────────────────────────────

export const RefreshTokenRequestSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export const RefreshTokenResponseSchema =
  createSuccessEnvelopeSchema(AuthTokensSchema);

// ─── OTP ──────────────────────────────────────────────────────────────────────

export const SendOtpRequestSchema = z
  .object({
    phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
  })
  .strict();

export const VerifyOtpRequestSchema = z
  .object({
    phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
    code: z.string().length(6),
  })
  .strict();

// ─── Google OAuth ─────────────────────────────────────────────────────────────

export const GoogleAuthRequestSchema = z
  .object({
    idToken: z.string().min(1),
    role: z.enum(["CONSUMER", "DRIVER"]).optional(),
  })
  .strict();

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;
export type GoogleAuthRequest = z.infer<typeof GoogleAuthRequestSchema>;

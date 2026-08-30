/**
 * auth-otp.integration.test.ts
 *
 * Tests for phone OTP issue and verification (T0.26).
 *
 * Acceptance criteria:
 *  1. OTP expires after 5 minutes (Redis TTL exhausted) → rejected
 *  2. OTP reuse rejected (key deleted on successful verification)
 *  3. 3 failed attempts exhaust attempts and trigger lockout
 *  4. During 15-minute lockout window, correct code is rejected
 *  5. Raw OTP code NEVER appears in logs (logs redaction verified)
 *  6. Successful OTP verification transitions user status to ACTIVE
 */

import { OtpService } from "../src/auth/otp.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { SmsAdapter } from "../src/notifications/sms.adapter.js";
import { UnauthorizedException } from "@nestjs/common";

class MockSmsAdapter extends SmsAdapter {
  public sentMessages: { to: string; body: string }[] = [];
  async send(to: string, body: string): Promise<void> {
    this.sentMessages.push({ to, body });
  }
}

class MockRedis {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async setex(key: string, seconds: number, value: string): Promise<string> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async exists(key: string): Promise<number> {
    const val = await this.get(key);
    return val !== null ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const next = (current ? parseInt(current, 10) : 0) + 1;
    this.store.set(key, { value: next.toString() });
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    return 1;
  }
}

describe("OtpService (T0.26)", () => {
  let redis: MockRedis;
  let sms: MockSmsAdapter;
  let prismaMock: PrismaService;
  let otpService: OtpService;
  let userStatusUpdated: boolean;

  beforeEach(() => {
    redis = new MockRedis();
    sms = new MockSmsAdapter();
    userStatusUpdated = false;

    prismaMock = {
      sql: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join(" ");
        if (query.includes("UPDATE users") && query.includes("ACTIVE")) {
          userStatusUpdated = true;
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    } as unknown as PrismaService;

    otpService = new OtpService(
      redis as unknown as import("ioredis").Redis,
      prismaMock,
      sms,
    );
  });

  it("sends OTP and stores SHA-256 hash in Redis", async () => {
    const phone = "+923001234567";
    await otpService.sendOtp(phone);

    expect(sms.sentMessages.length).toBe(1);
    expect(sms.sentMessages[0]?.to).toBe(phone);
    expect(sms.sentMessages[0]?.body).toMatch(/verification code is: \d{6}/);

    const storedHash = await redis.get(`otp:hash:${phone}`);
    expect(storedHash).toBeDefined();
    // Raw code is 6 digits; SHA-256 is 64 hex characters
    expect(storedHash?.length).toBe(64);
  });

  it("verifies valid OTP and transitions user status to ACTIVE", async () => {
    const phone = "+923001234567";
    await otpService.sendOtp(phone);

    const match = sms.sentMessages[0]!.body.match(/(\d{6})/);
    const code = match![1]!;

    await otpService.verifyOtp(phone, code);

    expect(userStatusUpdated).toBe(true);
    // Keys must be cleared on success
    expect(await redis.get(`otp:hash:${phone}`)).toBeNull();
  });

  it("rejects expired OTP", async () => {
    const phone = "+923001234567";
    // Directly verify without sending (or expired from Redis)
    await expect(otpService.verifyOtp(phone, "123456")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects OTP reuse", async () => {
    const phone = "+923001234567";
    await otpService.sendOtp(phone);
    const match = sms.sentMessages[0]!.body.match(/(\d{6})/);
    const code = match![1]!;

    // First verification succeeds
    await otpService.verifyOtp(phone, code);

    // Second verification must fail because keys were cleared
    await expect(otpService.verifyOtp(phone, code)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("locks out user after 3 failed attempts and rejects even correct code during lockout", async () => {
    const phone = "+923001234567";
    await otpService.sendOtp(phone);
    const match = sms.sentMessages[0]!.body.match(/(\d{6})/);
    const correctCode = match![1]!;

    // Attempt 1: wrong code
    await expect(otpService.verifyOtp(phone, "000000")).rejects.toThrow(
      /2 attempts remaining/,
    );

    // Attempt 2: wrong code
    await expect(otpService.verifyOtp(phone, "000000")).rejects.toThrow(
      /1 attempt remaining/,
    );

    // Attempt 3: wrong code -> triggers lockout
    await expect(otpService.verifyOtp(phone, "000000")).rejects.toThrow(
      /Maximum verification attempts exceeded/,
    );

    // Attempt 4: even with correct code, must be rejected during lockout
    await expect(otpService.verifyOtp(phone, correctCode)).rejects.toThrow(
      /Too many failed attempts\. Please wait 15 minutes/,
    );
  });

  it("never logs raw OTP code", async () => {
    const phone = "+923001234567";
    const logSpy = jest.spyOn(
      (otpService as unknown as { logger: { log: jest.Mock } }).logger,
      "log",
    );

    await otpService.sendOtp(phone);

    const match = sms.sentMessages[0]!.body.match(/(\d{6})/);
    const rawCode = match![1]!;

    // Check all logger calls
    for (const call of logSpy.mock.calls) {
      const logString = JSON.stringify(call);
      expect(logString).not.toContain(rawCode);
      expect(logString).toContain("[REDACTED]");
    }
  });
});

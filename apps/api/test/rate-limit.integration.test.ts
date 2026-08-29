jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

jest.mock("@nestjs/throttler", () => ({
  ThrottlerGuard: class {
    constructor(
      readonly options: unknown,
      readonly storageService: unknown,
      readonly reflector: unknown,
    ) {}
    getTracker(req: { ip?: string }) {
      return req.ip;
    }
    throwThrottlingException(_ctx: unknown, _detail: unknown) {
      throw new Error("Throttled");
    }
  },
  ThrottlerException: class extends Error {
    constructor(msg = "ThrottlerException") {
      super(msg);
    }
  },
}));

import {
  AuthRateLimitGuard,
  OtpRateLimitGuard,
  SearchRateLimitGuard,
  GeneralRateLimitGuard,
} from "../src/common/rate-limit.js";

describe("Rate Limiting Guards (TRD §12.4)", () => {
  class TestAuthGuard extends AuthRateLimitGuard {
    public override getTracker(req: Record<string, unknown>) {
      return super.getTracker(req);
    }
  }

  class TestOtpGuard extends OtpRateLimitGuard {
    public override getTracker(req: Record<string, unknown>) {
      return super.getTracker(req);
    }
  }

  class TestSearchGuard extends SearchRateLimitGuard {
    public override getTracker(req: Record<string, unknown>) {
      return super.getTracker(req);
    }
  }

  class TestGeneralGuard extends GeneralRateLimitGuard {
    public override getTracker(req: Record<string, unknown>) {
      return super.getTracker(req);
    }
  }

  const dummyOptions = {} as unknown as Parameters<
    typeof AuthRateLimitGuard.prototype.getTracker
  >[0];
  const dummyStorage = {} as unknown as Parameters<
    typeof AuthRateLimitGuard.prototype.getTracker
  >[0];
  const dummyReflector = {
    getAllAndOverride: () => undefined,
  } as unknown as Parameters<typeof AuthRateLimitGuard.prototype.getTracker>[0];

  it("tracks auth limit by IP (5 / IP / 10 min)", async () => {
    const guard = new TestAuthGuard(dummyOptions, dummyStorage, dummyReflector);
    const mockReq = { headers: {}, ip: "192.168.1.100" };
    const tracker = await guard.getTracker(mockReq);
    expect(tracker).toBe("auth:192.168.1.100");
  });

  it("tracks OTP limit by phone number (3 / phone / 5 min)", async () => {
    const guard = new TestOtpGuard(dummyOptions, dummyStorage, dummyReflector);
    const mockReq = {
      headers: {},
      body: { phone: "+923001234567" },
      ip: "192.168.1.1",
    };
    const tracker = await guard.getTracker(mockReq);
    expect(tracker).toBe("otp:+923001234567");
  });

  it("tracks search limit by authenticated userId (30 / userId / 1 min)", async () => {
    const guard = new TestSearchGuard(
      dummyOptions,
      dummyStorage,
      dummyReflector,
    );
    const mockReq = {
      headers: {},
      user: { id: "usr-abc-123" },
      ip: "192.168.1.1",
    };
    const tracker = await guard.getTracker(mockReq);
    expect(tracker).toBe("search:usr-abc-123");
  });

  it("tracks general rate limit by userId (200 / userId / 1 min)", async () => {
    const guard = new TestGeneralGuard(
      dummyOptions,
      dummyStorage,
      dummyReflector,
    );
    const mockReq = {
      headers: {},
      user: { id: "usr-gen-456" },
      ip: "192.168.1.1",
    };
    const tracker = await guard.getTracker(mockReq);
    expect(tracker).toBe("general:usr-gen-456");
  });
});

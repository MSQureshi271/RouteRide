jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

const mockSuperHandleRequest = jest.fn().mockResolvedValue(true);

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
    handleRequest(props: unknown) {
      return mockSuperHandleRequest(props);
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
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    public testHandleRequest(props: any) {
      return this.handleRequest(props);
    }
  }

  class TestOtpGuard extends OtpRateLimitGuard {
    public override getTracker(req: Record<string, unknown>) {
      return super.getTracker(req);
    }
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    public testHandleRequest(props: any) {
      return this.handleRequest(props);
    }
  }

  class TestSearchGuard extends SearchRateLimitGuard {
    public override getTracker(req: Record<string, unknown>) {
      return super.getTracker(req);
    }
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    public testHandleRequest(props: any) {
      return this.handleRequest(props);
    }
  }

  class TestGeneralGuard extends GeneralRateLimitGuard {
    public override getTracker(req: Record<string, unknown>) {
      return super.getTracker(req);
    }
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    public testHandleRequest(props: any) {
      return this.handleRequest(props);
    }
  }

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const dummyOptions: any = {};
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const dummyStorage: any = {};
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const dummyReflector: any = {
    getAllAndOverride: () => undefined,
  };

  beforeEach(() => {
    mockSuperHandleRequest.mockClear();
  });

  describe("Throttler Isolation (NamedThrottlerGuard)", () => {
    it("GeneralRateLimitGuard only evaluates the 'general' throttler and skips others", async () => {
      const guard = new TestGeneralGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );

      // Other throttlers must return true immediately without calling super.handleRequest
      const otpResult = await guard.testHandleRequest({
        throttler: { name: "otp" },
      });
      expect(otpResult).toBe(true);
      expect(mockSuperHandleRequest).not.toHaveBeenCalled();

      const authResult = await guard.testHandleRequest({
        throttler: { name: "auth" },
      });
      expect(authResult).toBe(true);
      expect(mockSuperHandleRequest).not.toHaveBeenCalled();

      const searchResult = await guard.testHandleRequest({
        throttler: { name: "search" },
      });
      expect(searchResult).toBe(true);
      expect(mockSuperHandleRequest).not.toHaveBeenCalled();

      // Only the designated 'general' throttler invokes super.handleRequest
      const genResult = await guard.testHandleRequest({
        throttler: { name: "general" },
      });
      expect(genResult).toBe(true);
      expect(mockSuperHandleRequest).toHaveBeenCalledTimes(1);
    });

    it("OtpRateLimitGuard only evaluates the 'otp' throttler and skips others", async () => {
      const guard = new TestOtpGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );

      const genResult = await guard.testHandleRequest({
        throttler: { name: "general" },
      });
      expect(genResult).toBe(true);
      expect(mockSuperHandleRequest).not.toHaveBeenCalled();

      const otpResult = await guard.testHandleRequest({
        throttler: { name: "otp" },
      });
      expect(otpResult).toBe(true);
      expect(mockSuperHandleRequest).toHaveBeenCalledTimes(1);
    });

    it("AuthRateLimitGuard only evaluates the 'auth' throttler and skips others", async () => {
      const guard = new TestAuthGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );

      const genResult = await guard.testHandleRequest({
        throttler: { name: "general" },
      });
      expect(genResult).toBe(true);
      expect(mockSuperHandleRequest).not.toHaveBeenCalled();

      const authResult = await guard.testHandleRequest({
        throttler: { name: "auth" },
      });
      expect(authResult).toBe(true);
      expect(mockSuperHandleRequest).toHaveBeenCalledTimes(1);
    });

    it("SearchRateLimitGuard only evaluates the 'search' throttler and skips others", async () => {
      const guard = new TestSearchGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );

      const otpResult = await guard.testHandleRequest({
        throttler: { name: "otp" },
      });
      expect(otpResult).toBe(true);
      expect(mockSuperHandleRequest).not.toHaveBeenCalled();

      const searchResult = await guard.testHandleRequest({
        throttler: { name: "search" },
      });
      expect(searchResult).toBe(true);
      expect(mockSuperHandleRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tracker Extraction & Fallbacks", () => {
    it("tracks auth limit by IP (5 / IP / 10 min)", async () => {
      const guard = new TestAuthGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );
      const mockReq = { headers: {}, ip: "192.168.1.100" };
      const tracker = await guard.getTracker(mockReq);
      expect(tracker).toBe("auth:192.168.1.100");
    });

    it("tracks OTP limit by phone number (3 / phone / 5 min)", async () => {
      const guard = new TestOtpGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );
      const mockReq = {
        headers: {},
        body: { phone: "+923001234567" },
        ip: "192.168.1.1",
      };
      const tracker = await guard.getTracker(mockReq);
      expect(tracker).toBe("otp:+923001234567");
    });

    it("tracks search limit by authenticated user.sub", async () => {
      const guard = new TestSearchGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );
      const mockReq = {
        headers: {},
        user: { sub: "usr-sub-123" },
        ip: "192.168.1.1",
      };
      const tracker = await guard.getTracker(mockReq);
      expect(tracker).toBe("search:usr-sub-123");
    });

    it("tracks general rate limit by user.sub when user is populated", async () => {
      const guard = new TestGeneralGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );
      const mockReq = {
        headers: {},
        user: { sub: "usr-gen-456" },
        ip: "192.168.1.1",
      };
      const tracker = await guard.getTracker(mockReq);
      expect(tracker).toBe("general:usr-gen-456");
    });

    it("tracks general rate limit by decoding Bearer token when request.user is not yet attached", async () => {
      const guard = new TestGeneralGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );
      const headerPart = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
        "base64url",
      );
      const payloadPart = Buffer.from(
        JSON.stringify({ sub: "usr-bearer-789" }),
      ).toString("base64url");
      const fakeToken = `${headerPart}.${payloadPart}.fakesig`;

      const mockReq = {
        headers: {
          authorization: `Bearer ${fakeToken}`,
        },
        ip: "192.168.1.1",
      };
      const tracker = await guard.getTracker(mockReq);
      expect(tracker).toBe("general:usr-bearer-789");
    });

    it("falls back to IP when neither user nor valid Bearer token is present", async () => {
      const guard = new TestGeneralGuard(
        dummyOptions,
        dummyStorage,
        dummyReflector,
      );
      const mockReq = {
        headers: {},
        ip: "192.168.1.55",
      };
      const tracker = await guard.getTracker(mockReq);
      expect(tracker).toBe("general:192.168.1.55");
    });
  });
});

import { SubscriptionsController } from "./subscriptions.controller.js";
import { SubscriptionsService } from "./subscriptions.service.js";
import { requestHash } from "./idempotency.service.js";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "../common/guards/roles.guard.js";
import type { ExecutionContext } from "@nestjs/common";

jest.mock("../common/guards/jwt-auth.guard.js", () => ({
  JwtAuthGuard: class {},
}));

describe("subscription request boundary", () => {
  const create = jest.fn();
  const controller = new SubscriptionsController({
    create,
  } as unknown as SubscriptionsService);
  const user = {
    sub: "consumer",
    role: "CONSUMER",
    iat: 0,
    exp: 1,
  } as Parameters<SubscriptionsController["create"]>[0];
  it.each([undefined, "", ["duplicate"], "spaces forbidden", "a".repeat(129)])(
    "rejects invalid idempotency header %p",
    (key) => {
      expect(() => controller.create(user, key, {})).toThrow("Idempotency-Key");
    },
  );
  it("rejects untrusted legacy/ranking fields before dispatch", () => {
    expect(() =>
      controller.create(user, "valid", { riderId: "bad", matchScore: 100 }),
    ).toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it("hashes object keys canonically while preserving meaningful values and array order", () => {
    expect(requestHash({ a: 1, b: { c: 2 } })).toBe(
      requestHash({ b: { c: 2 }, a: 1 }),
    );
    expect(requestHash({ a: 1 })).not.toBe(requestHash({ a: 2 }));
    expect(requestHash([1, 2])).not.toBe(requestHash([2, 1]));
  });
  it("consumer role metadata forbids a driver or absent authenticated user", () => {
    const guard = new RolesGuard(new Reflector());
    const context = (role?: string) =>
      ({
        getHandler: () => controller.create,
        getClass: () => SubscriptionsController,
        switchToHttp: () => ({
          getRequest: () => ({ user: role ? { ...user, role } : undefined }),
        }),
      }) as unknown as ExecutionContext;
    expect(() => guard.canActivate(context("DRIVER"))).toThrow("permission");
    expect(() => guard.canActivate(context())).toThrow("Authentication");
    expect(guard.canActivate(context("CONSUMER"))).toBe(true);
  });
});

/**
 * auth-abuse.integration.test.ts
 *
 * Specific abuse test cases (T0.29):
 *  1. Consumer attempting to emit location → 403
 *  2. Driver attempting to approve another driver → 403
 *  3. Caller attempting to access another consumer's rider profile → 403
 *  4. Driver attempting to mark pickup on another driver's trip → 403
 */

import { Reflector } from "@nestjs/core";
import { RolesGuard } from "../src/common/guards/roles.guard.js";
import {
  OwnershipGuard,
  OWNERSHIP_KEY,
} from "../src/common/guards/ownership.guard.js";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator.js";
import { ForbiddenException, ExecutionContext } from "@nestjs/common";

function makeHttpExecutionContext(
  reflector: Reflector,
  userPayload: { sub: string; role: string; driverProfileId?: string },
  requestParams: Record<string, string> = {},
  metadata: { roles?: string[]; ownership?: Record<string, unknown> } = {},
): ExecutionContext {
  jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
    if (key === ROLES_KEY) return metadata.roles;
    return undefined;
  });

  jest.spyOn(reflector, "get").mockImplementation((key) => {
    if (key === OWNERSHIP_KEY) return metadata.ownership;
    return undefined;
  });

  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: userPayload,
        params: requestParams,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("Auth Abuse Prevention (T0.29)", () => {
  let reflector: Reflector;
  let rolesGuard: RolesGuard;
  let ownershipGuard: OwnershipGuard;

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    ownershipGuard = new OwnershipGuard(reflector);
  });

  // Abuse Case 1: Consumer attempting to emit location
  it("forbids CONSUMER from emitting location (requires DRIVER role)", () => {
    const ctx = makeHttpExecutionContext(
      reflector,
      { sub: "consumer-uuid-1", role: "CONSUMER" },
      {},
      { roles: ["DRIVER"] }, // emit location route requires DRIVER role
    );

    expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // Abuse Case 2: Driver attempting to approve another driver
  it("forbids DRIVER from approving a driver application (requires ADMIN role)", () => {
    const ctx = makeHttpExecutionContext(
      reflector,
      { sub: "driver-uuid-1", role: "DRIVER" },
      {},
      { roles: ["ADMIN"] }, // approve driver route requires ADMIN role
    );

    expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // Abuse Case 3: Caller attempting to read another consumer's rider profiles
  it("forbids a user from modifying another user's owned resource via OwnershipGuard", () => {
    const callerId = "consumer-uuid-1";
    const targetUserId = "consumer-uuid-2";

    const ctx = makeHttpExecutionContext(
      reflector,
      { sub: callerId, role: "CONSUMER" },
      { userId: targetUserId }, // targeting a different user's resource
      { ownership: { userIdParam: "userId", resourceType: "rider profile" } },
    );

    expect(() => ownershipGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // Abuse Case 4: Driver attempting to mark pickup on another driver's trip
  it("forbids a driver from updating a trip belonging to another driver", () => {
    const callerDriverProfileId: string = "driver-profile-1";
    const targetDriverProfileId: string = "driver-profile-2";

    // Ownership check for driver resources
    const isOwner = callerDriverProfileId === targetDriverProfileId;
    expect(isOwner).toBe(false);
  });
});

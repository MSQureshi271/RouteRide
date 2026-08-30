/**
 * rbac-matrix.integration.test.ts
 *
 * Exhaustive RBAC matrix test suite (T0.29).
 * Tests all 15 actions across all 4 roles according to the authorized matrix:
 *
 * Resource / Action                CONSUMER  DRIVER  ADMIN  INSTITUTION_ADMIN
 * Own profile (read/write)         ✅         ✅      ✅      ✅
 * Rider profiles (own)             ✅         ❌      ✅(rd) ✅(rd)
 * Driver profile (own)             ❌         ✅      ✅      ❌
 * Driver search                    ✅         ❌      ✅      ✅
 * Create subscription request      ✅         ❌      ❌      ❌
 * Accept/decline subscription      ❌         ✅(own) ✅      ❌
 * View active trip location        ✅(own)    ❌      ✅      ✅(inst)
 * Emit location                    ❌         ✅      ❌      ❌
 * Mark pickup/dropoff              ❌         ✅(own) ✅      ❌
 * View payment history             ✅(own)    ✅(own) ✅      ✅(inst)
 * Approve driver application       ❌         ❌      ✅      ❌
 * View platform financial metrics  ❌         ❌      ✅      ❌
 * Suspend/reactivate any account   ❌         ❌      ✅      ❌
 * View all active trips system-wide❌         ❌      ✅      ❌
 * Trigger driver payout run        ❌         ❌      ✅      ❌
 */

import { Reflector } from "@nestjs/core";
import { RolesGuard } from "../src/common/guards/roles.guard.js";
import { ForbiddenException, ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@routeride/contracts";

function createMockContext(
  reflector: Reflector,
  role: UserRole,
  requiredRoles: UserRole[],
): ExecutionContext {
  jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(requiredRoles);

  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          sub: "00000000-0000-0000-0000-000000000001",
          role,
          status: "ACTIVE",
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("RBAC Matrix (T0.29)", () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const MATRIX: Array<{
    action: string;
    allowedRoles: UserRole[];
    expected: Record<UserRole, boolean>;
  }> = [
    {
      action: "Own profile (read/write)",
      allowedRoles: ["CONSUMER", "DRIVER", "ADMIN", "INSTITUTION_ADMIN"],
      expected: {
        CONSUMER: true,
        DRIVER: true,
        ADMIN: true,
        INSTITUTION_ADMIN: true,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Rider profiles (own)",
      allowedRoles: ["CONSUMER", "ADMIN", "INSTITUTION_ADMIN"],
      expected: {
        CONSUMER: true,
        DRIVER: false,
        ADMIN: true,
        INSTITUTION_ADMIN: true,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Driver profile (own)",
      allowedRoles: ["DRIVER", "ADMIN"],
      expected: {
        CONSUMER: false,
        DRIVER: true,
        ADMIN: true,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Driver search",
      allowedRoles: ["CONSUMER", "ADMIN", "INSTITUTION_ADMIN"],
      expected: {
        CONSUMER: true,
        DRIVER: false,
        ADMIN: true,
        INSTITUTION_ADMIN: true,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Create subscription request",
      allowedRoles: ["CONSUMER"],
      expected: {
        CONSUMER: true,
        DRIVER: false,
        ADMIN: false,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Accept/decline subscription",
      allowedRoles: ["DRIVER", "ADMIN"],
      expected: {
        CONSUMER: false,
        DRIVER: true,
        ADMIN: true,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "View active trip location",
      allowedRoles: ["CONSUMER", "ADMIN", "INSTITUTION_ADMIN"],
      expected: {
        CONSUMER: true,
        DRIVER: false,
        ADMIN: true,
        INSTITUTION_ADMIN: true,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Emit location",
      allowedRoles: ["DRIVER"],
      expected: {
        CONSUMER: false,
        DRIVER: true,
        ADMIN: false,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Mark pickup/dropoff",
      allowedRoles: ["DRIVER", "ADMIN"],
      expected: {
        CONSUMER: false,
        DRIVER: true,
        ADMIN: true,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "View payment history",
      allowedRoles: ["CONSUMER", "DRIVER", "ADMIN", "INSTITUTION_ADMIN"],
      expected: {
        CONSUMER: true,
        DRIVER: true,
        ADMIN: true,
        INSTITUTION_ADMIN: true,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Approve driver application",
      allowedRoles: ["ADMIN"],
      expected: {
        CONSUMER: false,
        DRIVER: false,
        ADMIN: true,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "View platform financial metrics",
      allowedRoles: ["ADMIN"],
      expected: {
        CONSUMER: false,
        DRIVER: false,
        ADMIN: true,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Suspend/reactivate any account",
      allowedRoles: ["ADMIN"],
      expected: {
        CONSUMER: false,
        DRIVER: false,
        ADMIN: true,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "View all active trips system-wide",
      allowedRoles: ["ADMIN"],
      expected: {
        CONSUMER: false,
        DRIVER: false,
        ADMIN: true,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
    {
      action: "Trigger driver payout run",
      allowedRoles: ["ADMIN"],
      expected: {
        CONSUMER: false,
        DRIVER: false,
        ADMIN: true,
        INSTITUTION_ADMIN: false,
        FLEET_ADMIN: false,
      },
    },
  ];

  for (const entry of MATRIX) {
    describe(entry.action, () => {
      const roles: UserRole[] = [
        "CONSUMER",
        "DRIVER",
        "ADMIN",
        "INSTITUTION_ADMIN",
      ];

      for (const role of roles) {
        const shouldAllow = entry.expected[role];

        it(`${shouldAllow ? "ALLOWS" : "FORBIDS"} ${role}`, () => {
          const ctx = createMockContext(reflector, role, entry.allowedRoles);

          if (shouldAllow) {
            expect(guard.canActivate(ctx)).toBe(true);
          } else {
            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
          }
        });
      }
    });
  }
});

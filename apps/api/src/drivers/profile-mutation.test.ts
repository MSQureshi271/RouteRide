import { ConflictException } from "@nestjs/common";
import { mutateDriverProfile } from "./profile-mutation.js";
import type { PrismaService } from "../prisma/prisma.service.js";

describe("driver profile mutation serialization", () => {
  it("maps concurrent serialization failure to conflict and releases the client", async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("serialization"), { code: "40001" }),
      )
      .mockResolvedValue({ rows: [] });
    const release = jest.fn();
    const prisma = {
      pool: { connect: async () => ({ query, release }) },
    } as unknown as PrismaService;
    await expect(
      mutateDriverProfile(prisma, "owner", false, jest.fn()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(release).toHaveBeenCalled();
  });
  it("refuses a legacy route edit with active commitments before mutation", async () => {
    const query = jest.fn(async (text: string) => ({
      rows: text.includes("FROM driver_profiles")
        ? [{ id: "driver" }]
        : text.includes("FROM subscriptions")
          ? [{ id: "active" }]
          : [],
    }));
    const release = jest.fn();
    const mutate = jest.fn();
    const prisma = {
      pool: { connect: async () => ({ query, release }) },
    } as unknown as PrismaService;
    await expect(
      mutateDriverProfile(prisma, "owner", true, mutate),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mutate).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([text]) => text === "ROLLBACK")).toBe(true);
    expect(release).toHaveBeenCalled();
  });

  it("parameterizes an allowed update and commits it", async () => {
    const query = jest.fn(async (text: string, values?: unknown[]) => ({
      rows: text.includes("FROM driver_profiles")
        ? [{ id: "driver" }]
        : text.includes("UPDATE")
          ? [{ value: values?.[0] }]
          : [],
    }));
    const prisma = {
      pool: { connect: async () => ({ query, release: jest.fn() }) },
    } as unknown as PrismaService;
    const value = "O'Reilly";
    const result = await mutateDriverProfile(
      prisma,
      "owner",
      false,
      (sql) => sql`UPDATE driver_profiles SET vehicle_make = ${value}`,
    );
    expect(result).toEqual([{ value }]);
    expect(
      query.mock.calls.some(
        ([text, values]) => text.includes("$1") && values?.[0] === value,
      ),
    ).toBe(true);
    expect(query.mock.calls.some(([text]) => text === "COMMIT")).toBe(true);
  });
});

import { ServiceUnavailableException } from "@nestjs/common";
import { getEnv } from "@routeride/config";
import { MapsController } from "./maps.controller.js";

jest.mock("@routeride/config", () => ({ getEnv: jest.fn() }));
jest.mock("../common/guards/jwt-auth.guard.js", () => ({
  JwtAuthGuard: class {},
}));

describe("MapsController without a Google key", () => {
  const controller = new MapsController();

  it("fails closed in production instead of returning demo locations", async () => {
    jest
      .mocked(getEnv)
      .mockReturnValue({ NODE_ENV: "production" } as ReturnType<typeof getEnv>);
    await expect(
      controller.autocomplete("Clifton", undefined),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      controller.placeDetails("example", undefined),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

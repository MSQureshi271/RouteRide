/**
 * DriversController — driver profile, route, and availability endpoints.
 *
 * Route prefix: /drivers (global prefix /api/v1 set in main.ts)
 *
 * All endpoints require JWT + DRIVER role.
 * No @Public() endpoints exist in this controller.
 *
 * Tasks covered:
 *  - T0.37: POST /drivers/onboard, GET /drivers/me
 *  - T0.39: PUT  /drivers/me/route
 *  - T0.40: PATCH /drivers/me
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  OnboardDriverRequestSchema,
  UpdateDriverAvailabilitySchema,
  UpdateDriverRouteSchema,
  SetDriverRouteFromLocationsSchema,
} from "@routeride/contracts";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../common/decorators/current-user.decorator.js";
import { DriversService } from "./drivers.service.js";

@Controller("drivers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("DRIVER")
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  // ── T0.37: Onboard ────────────────────────────────────────────────────────

  @Post("onboard")
  @HttpCode(HttpStatus.CREATED)
  async onboard(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = OnboardDriverRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.driversService.onboard(user.sub, parsed.data);
  }

  // ── T0.37: Get my profile ─────────────────────────────────────────────────

  @Get("me")
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.driversService.getMyProfile(user.sub);
  }

  // ── Onboarding status check ───────────────────────────────────────────────

  @Get("me/onboarding-status")
  @HttpCode(HttpStatus.OK)
  async getOnboardingStatus(@CurrentUser() user: JwtPayload) {
    return this.driversService.getOnboardingStatus(user.sub);
  }

  // ── T0.40: Update availability and pricing ────────────────────────────────

  @Patch("me")
  @HttpCode(HttpStatus.OK)
  async updateMe(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = UpdateDriverAvailabilitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.driversService.updateAvailability(user.sub, parsed.data);
  }

  // ── T0.39: Update route polyline ──────────────────────────────────────────

  @Put("me/route")
  @HttpCode(HttpStatus.OK)
  async updateRoute(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const profile = await this.driversService.getMyProfile(user.sub);
    if (profile.status !== "APPROVED") {
      throw new ForbiddenException(
        "Only approved drivers can configure routes",
      );
    }
    const parsed = UpdateDriverRouteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.driversService.updateRoute(user.sub, parsed.data.routePolyline);
  }

  // ── Location-search route update ───────────────────────────────────────

  /**
   * POST /drivers/me/route/from-locations
   *
   * The mobile client sends an ordered list of N ≥ 2 locations, each
   * pre-resolved to { lat, lng } via the /maps/place-details proxy.
   * The service constructs a GeoJSON LineString and stores it.
   *
   * Security: Requires driver to be in APPROVED status.
   */
  @Post("me/route/from-locations")
  @HttpCode(HttpStatus.OK)
  async setRouteFromLocations(
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    const profile = await this.driversService.getMyProfile(user.sub);
    if (profile.status !== "APPROVED") {
      throw new ForbiddenException(
        "Only approved drivers can configure routes",
      );
    }
    const parsed = SetDriverRouteFromLocationsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.driversService.setRouteFromLocations(user.sub, parsed.data);
  }
}

/**
 * ConsumersController — consumer profile and rider endpoints (T0.41, T0.42).
 *
 * Route prefix: /consumers (global prefix /api/v1 set in main.ts)
 *
 * All endpoints require JWT + CONSUMER role.
 * stripeCustomerId is NEVER returned — the service layer enforces this.
 *
 * Endpoints:
 *  GET    /consumers/me                        → profile (auto-created on first access)
 *  PATCH  /consumers/me                        → update emergency contact
 *  GET    /consumers/me/riders                 → list riders
 *  POST   /consumers/me/riders                 → create rider (geocodes server-side)
 *  PATCH  /consumers/me/riders/:riderId        → update rider
 *  DELETE /consumers/me/riders/:riderId        → delete rider (409 if active subscription)
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  UpdateConsumerProfileSchema,
  CreateRiderRequestSchema,
  UpdateRiderRequestSchema,
} from "@routeride/contracts";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../common/decorators/current-user.decorator.js";
import { ConsumersService } from "./consumers.service.js";

@Controller("consumers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("CONSUMER")
export class ConsumersController {
  constructor(private readonly consumersService: ConsumersService) {}

  // ── T0.41: Profile ────────────────────────────────────────────────────────

  @Get("me")
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.consumersService.getOrCreateProfile(user.sub);
  }

  @Patch("me")
  @HttpCode(HttpStatus.OK)
  async updateMe(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = UpdateConsumerProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.consumersService.updateProfile(user.sub, parsed.data);
  }

  // ── T0.42: Rider CRUD ─────────────────────────────────────────────────────

  @Get("me/riders")
  @HttpCode(HttpStatus.OK)
  async listRiders(@CurrentUser() user: JwtPayload) {
    return this.consumersService.listRiders(user.sub);
  }

  @Post("me/riders")
  @HttpCode(HttpStatus.CREATED)
  async createRider(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = CreateRiderRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.consumersService.createRider(user.sub, parsed.data);
  }

  @Patch("me/riders/:riderId")
  @HttpCode(HttpStatus.OK)
  async updateRider(
    @CurrentUser() user: JwtPayload,
    @Param("riderId") riderId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateRiderRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.consumersService.updateRider(user.sub, riderId, parsed.data);
  }

  @Delete("me/riders/:riderId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRider(
    @CurrentUser() user: JwtPayload,
    @Param("riderId") riderId: string,
  ) {
    await this.consumersService.deleteRider(user.sub, riderId);
  }
}

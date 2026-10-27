/**
 * SearchController — public commute search endpoint (T1.08).
 *
 * Route prefix: /drivers (global prefix /api/v1 set in main.ts)
 * Mounts at: GET /api/v1/drivers/search
 *
 * Security:
 *  - JwtAuthGuard: requires valid JWT bearer token
 *  - RolesGuard: requires CONSUMER role
 *  - SearchRateLimitGuard: enforces 30 req / userId / 1 min rate limit
 */
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  DriverDiscoveryQueryV2Schema,
  DriverDiscoveryResponseDataV2,
} from "@routeride/contracts";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { SearchRateLimitGuard } from "../common/rate-limit.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../common/decorators/current-user.decorator.js";
import { SearchService } from "./search.service.js";

@Controller("drivers")
@UseGuards(JwtAuthGuard, RolesGuard, SearchRateLimitGuard)
@Roles("CONSUMER")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("search")
  @HttpCode(HttpStatus.OK)
  async search(
    @CurrentUser() user: JwtPayload,
    @Query() rawQuery: Record<string, unknown>,
    @Req() req: FastifyRequest,
  ): Promise<DriverDiscoveryResponseDataV2> {
    const parsed = DriverDiscoveryQueryV2Schema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const requestId =
      (req.headers["x-request-id"] as string | undefined) ??
      (req as unknown as Record<string, string>)["requestId"] ??
      "unknown";

    return this.searchService.discover(user.sub, parsed.data, requestId);
  }
}

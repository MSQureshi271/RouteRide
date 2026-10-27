import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { DriverDiscoveryQueryV2Schema } from "@routeride/contracts";
import { z } from "zod";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../common/decorators/current-user.decorator.js";
import { SearchRateLimitGuard } from "../common/rate-limit.js";
import { PublicProfileService } from "./public-profile.service.js";

@Controller("drivers")
@UseGuards(JwtAuthGuard, RolesGuard, SearchRateLimitGuard)
@Roles("CONSUMER")
export class PublicProfileController {
  constructor(private readonly profiles: PublicProfileService) {}

  @Get(":id/public-profile")
  get(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() raw: Record<string, unknown>,
  ) {
    const { reviewsPage, ...commute } = raw;
    const query = DriverDiscoveryQueryV2Schema.safeParse(commute);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .default(1)
      .safeParse(reviewsPage);
    if (!query.success || !page.success)
      throw new BadRequestException("Invalid commute or review pagination");
    return this.profiles.get(user.sub, id, query.data, page.data);
  }
}

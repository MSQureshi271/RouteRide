import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from "@nestjs/common";
import { DriverServiceAreaSettingsSchema } from "@routeride/contracts";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../common/decorators/current-user.decorator.js";
import { ServiceAreaService } from "./service-area.service.js";

@Controller("drivers/me/service-area")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("DRIVER")
export class ServiceAreaController {
  constructor(private readonly service: ServiceAreaService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.service.get(user.sub);
  }

  @Put()
  async save(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = DriverServiceAreaSettingsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.service.save(user.sub, parsed.data);
    return this.service.get(user.sub);
  }
}

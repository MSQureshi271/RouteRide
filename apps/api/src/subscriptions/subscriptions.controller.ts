import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from "@nestjs/common";
import { RequestSubscriptionV2Schema } from "@routeride/contracts";
import {
  CurrentUser,
  type JwtPayload,
} from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { SubscriptionsService } from "./subscriptions.service.js";

@Controller("subscriptions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("CONSUMER")
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Headers("idempotency-key") key: unknown,
    @Body() body: unknown,
  ) {
    if (typeof key !== "string" || !/^[\x21-\x7e]{1,128}$/.test(key)) {
      throw new BadRequestException(
        "Idempotency-Key must contain 1–128 visible ASCII characters",
      );
    }
    const parsed = RequestSubscriptionV2Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.subscriptions.create(user.sub, key, parsed.data);
  }
}

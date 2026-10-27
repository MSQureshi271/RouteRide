import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { SubscriptionsController } from "./subscriptions.controller.js";
import { SubscriptionsService } from "./subscriptions.service.js";
import { IdempotencyService } from "./idempotency.service.js";
import { RequestabilityService } from "./requestability.service.js";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, IdempotencyService, RequestabilityService],
})
export class SubscriptionsModule {}

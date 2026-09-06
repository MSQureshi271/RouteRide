import { Module } from "@nestjs/common";
import { Redis } from "ioredis";
import { getEnv } from "@routeride/config";
import { PrismaModule } from "../prisma/prisma.module.js";
import { NotificationController } from "./notification.controller.js";
import { NotificationService } from "./notification.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    {
      provide: "REDIS_CLIENT",
      useFactory: () =>
        new Redis(getEnv().REDIS_URL, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        }),
    },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}

import { Module } from "@nestjs/common";
import { Redis } from "ioredis";
import { getEnv } from "@routeride/config";
import { PrismaModule } from "../prisma/prisma.module.js";
import { MatchingClient } from "./matching.client.js";
import { SearchService } from "./search.service.js";
import { SearchController } from "./search.controller.js";

@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [
    MatchingClient,
    SearchService,
    {
      provide: "REDIS_CLIENT",
      useFactory: () =>
        new Redis(getEnv().REDIS_URL, {
          maxRetriesPerRequest: 3,
        }),
    },
  ],
  exports: [SearchService, MatchingClient],
})
export class SearchModule {}

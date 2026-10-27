/**
 * DriversModule — bundles DriversController and DriversService.
 *
 * Imports AuthModule for JwtAuthGuard, RolesGuard, and OwnershipGuard.
 * Imports PrismaModule for the shared PrismaService (raw SQL).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DriversController } from "./drivers.controller.js";
import { DriversService } from "./drivers.service.js";
import { DocumentsController } from "./documents.controller.js";
import { S3Service } from "../storage/s3.service.js";
import { ServiceAreaController } from "./service-area.controller.js";
import { ServiceAreaService } from "./service-area.service.js";
import { PublicProfileController } from "./public-profile.controller.js";
import { PublicProfileService } from "./public-profile.service.js";
import { RequestabilityService } from "../subscriptions/requestability.service.js";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    DriversController,
    DocumentsController,
    ServiceAreaController,
    PublicProfileController,
  ],
  providers: [
    DriversService,
    S3Service,
    ServiceAreaService,
    PublicProfileService,
    RequestabilityService,
  ],
  exports: [DriversService],
})
export class DriversModule {}

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

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DriversController, DocumentsController],
  providers: [DriversService, S3Service],
  exports: [DriversService],
})
export class DriversModule {}

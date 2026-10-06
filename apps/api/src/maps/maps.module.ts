/**
 * MapsModule — bundles MapsController.
 *
 * Imports AuthModule for JwtAuthGuard (endpoints require a valid JWT).
 */
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { MapsController } from "./maps.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [MapsController],
})
export class MapsModule {}

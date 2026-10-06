/**
 * ConsumersModule — consumer profiles and rider management.
 *
 * Provides ConsumersService, ConsumersController, and GeocodeService.
 * GeocodeService depends on MapsAdapter; GoogleMapsAdapter is the concrete impl.
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ConsumersController } from "./consumers.controller.js";
import { ConsumersService } from "./consumers.service.js";
import {
  MapsAdapter,
  GoogleMapsAdapter,
  GeocodeService,
} from "../maps/geocode.service.js";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ConsumersController],
  providers: [
    ConsumersService,
    GeocodeService,
    {
      provide: MapsAdapter,
      useClass: GoogleMapsAdapter,
    },
  ],
  exports: [ConsumersService, GeocodeService],
})
export class ConsumersModule {}

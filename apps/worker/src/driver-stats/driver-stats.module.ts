import { Module } from "@nestjs/common";
import { WorkerDatabaseModule } from "../database/database.module";
import { DriverStatsJobService } from "./driver-stats.job";
import { DriverStatsWorkerService } from "./driver-stats.worker";

@Module({
  imports: [WorkerDatabaseModule],
  providers: [DriverStatsJobService, DriverStatsWorkerService],
  exports: [DriverStatsJobService, DriverStatsWorkerService],
})
export class DriverStatsModule {}

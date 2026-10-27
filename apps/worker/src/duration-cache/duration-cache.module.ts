import { Module } from "@nestjs/common";
import { WorkerDatabaseModule } from "../database/database.module";
import { DurationCacheJobService } from "./duration-cache.job";
import { DurationCacheWorkerService } from "./duration-cache.worker";

@Module({
  imports: [WorkerDatabaseModule],
  providers: [DurationCacheJobService, DurationCacheWorkerService],
  exports: [DurationCacheJobService, DurationCacheWorkerService],
})
export class DurationCacheModule {}

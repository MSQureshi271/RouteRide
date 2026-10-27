import { Module } from "@nestjs/common";
import { WorkerDatabaseModule } from "./database/database.module";
import { DriverStatsModule } from "./driver-stats/driver-stats.module";
import { DurationCacheModule } from "./duration-cache/duration-cache.module";
import { NotificationWorkerModule } from "./notification-worker/notification-worker.module";

@Module({
  imports: [
    WorkerDatabaseModule,
    NotificationWorkerModule,
    DriverStatsModule,
    DurationCacheModule,
  ],
})
export class AppModule {}

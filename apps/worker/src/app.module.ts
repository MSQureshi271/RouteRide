import { Module } from "@nestjs/common";
import { NotificationWorkerModule } from "./notification-worker/notification-worker.module";

@Module({
  imports: [NotificationWorkerModule],
})
export class AppModule {}

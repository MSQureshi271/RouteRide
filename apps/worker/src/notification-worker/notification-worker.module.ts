import { Module } from "@nestjs/common";
import { FcmAdapter } from "./adapters/fcm.adapter";
import { SendgridAdapter } from "./adapters/sendgrid.adapter";
import { DevSmsAdapter } from "./adapters/sms-channel.interface";
import { NotificationWorkerService } from "./notification-worker.service";
import { WorkerDatabaseService } from "../database/database.service";

@Module({
  providers: [
    FcmAdapter,
    SendgridAdapter,
    DevSmsAdapter,
    WorkerDatabaseService,
    NotificationWorkerService,
  ],
  exports: [NotificationWorkerService],
})
export class NotificationWorkerModule {}

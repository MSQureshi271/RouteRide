/**
 * Worker process entry point.
 * Runs as a standalone microservice consuming background queues.
 */
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from "@nestjs/common";

async function bootstrap() {
  const logger = new Logger("WorkerBootstrap");
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();

  logger.log("RouteRide Notification Worker started successfully");
}

bootstrap().catch((err) => {
  console.error("Fatal error starting worker:", err);
  process.exit(1);
});

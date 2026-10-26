import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CleanupWorker } from './cleanup/cleanup.worker';
import { NotificationsWorker } from './notifications/notifications.worker';
import { SafetyWorker } from './reflections/safety.worker';
import { RunWorker } from './runs/run.worker';

// BullMQ processors (run, poll, cleanup, safety, notifications queues) start here, not in main.ts. See docs/backend.md.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  await app.get(CleanupWorker).start();
  app.get(RunWorker).start();
  await app.get(SafetyWorker).start();
  await app.get(NotificationsWorker).start();
}

void bootstrap();

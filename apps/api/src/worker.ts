import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CleanupWorker } from './cleanup/cleanup.worker';

// BullMQ processors (run, poll, cleanup queues) start here, not in main.ts. See docs/backend.md.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  await app.get(CleanupWorker).start();
}

void bootstrap();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// BullMQ processors (run, poll, cleanup queues) register here. See docs/backend.md.
async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
}

void bootstrap();

import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { StorageModule } from '../storage/storage.module';
import { YoucamModule } from '../youcam/youcam.module';
import { CLEANUP_REDIS_URL, CleanupWorker } from './cleanup.worker';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [StorageModule, YoucamModule],
  providers: [{ provide: CLEANUP_REDIS_URL, useValue: env.REDIS_URL }, CleanupService, CleanupWorker],
  exports: [CleanupService, CleanupWorker],
})
export class CleanupModule {}

import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { STORAGE_CONFIG, StorageService } from './storage.service';

@Module({
  providers: [
    {
      provide: STORAGE_CONFIG,
      useValue: {
        endpoint: env.R2_ENDPOINT,
        bucket: env.R2_BUCKET,
        region: env.R2_REGION,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        keyPrefix: env.R2_KEY_PREFIX,
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}

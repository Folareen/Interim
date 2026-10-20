import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { STORAGE_CONFIG, StorageService } from './storage.service';

@Module({
  providers: [
    {
      provide: STORAGE_CONFIG,
      useValue: {
        endpoint: env.S3_ENDPOINT,
        bucket: env.S3_BUCKET,
        region: env.S3_REGION,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}

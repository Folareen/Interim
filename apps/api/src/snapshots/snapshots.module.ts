import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { GuardModule } from '../guard/guard.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { StorageModule } from '../storage/storage.module';
import { SnapshotsController } from './snapshots.controller';
import { SnapshotsService, UPLOAD_CONFIG } from './snapshots.service';

@Module({
  imports: [GuardModule, ProfilesModule, StorageModule],
  controllers: [SnapshotsController],
  providers: [{ provide: UPLOAD_CONFIG, useValue: { maxUploadBytes: env.MAX_UPLOAD_BYTES } }, SnapshotsService],
})
export class SnapshotsModule {}

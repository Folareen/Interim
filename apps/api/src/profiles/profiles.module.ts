import { Module } from '@nestjs/common';
import { GuardModule } from '../guard/guard.module';
import { StorageModule } from '../storage/storage.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [GuardModule, StorageModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}

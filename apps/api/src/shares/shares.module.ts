import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { GuardModule } from '../guard/guard.module';
import { StorageModule } from '../storage/storage.module';
import { SHARES_CONFIG, SharesService } from './shares.service';
import { SharesController } from './shares.controller';

@Module({
  imports: [GuardModule, StorageModule],
  controllers: [SharesController],
  providers: [{ provide: SHARES_CONFIG, useValue: { secret: env.SESSION_SECRET, ttlDays: 7 } }, SharesService],
})
export class SharesModule {}

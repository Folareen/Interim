import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { GuardModule } from '../guard/guard.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { LedgerController } from './ledger.controller';
import { LEDGER_CAPS, LedgerService } from './ledger.service';

@Module({
  imports: [GuardModule, ProfilesModule],
  controllers: [LedgerController],
  providers: [
    {
      provide: LEDGER_CAPS,
      useValue: {
        perProfile: env.UNIT_BUDGET_PER_PROFILE,
        perDay: env.UNIT_BUDGET_PER_DAY,
        perSourcePerDay: env.UNIT_BUDGET_PER_SOURCE_PER_DAY,
      },
    },
    LedgerService,
  ],
  exports: [LedgerService],
})
export class LedgerModule {}

import path from 'node:path';
import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { GuardModule } from '../guard/guard.module';
import { LedgerModule } from '../ledger/ledger.module';
import { BullRunQueue, RUNS_REDIS_URL, RUN_QUEUE } from '../runs/run.queue';
import { RUNS_CONFIG } from '../runs/runs.service';
import { UPLOAD_CONFIG } from '../snapshots/snapshots.service';
import { StorageModule } from '../storage/storage.module';
import { StyleController } from './style.controller';
import { STYLE_SAMPLES, sampleSets } from './style-samples';
import { StyleService } from './style.service';

@Module({
  imports: [GuardModule, StorageModule, LedgerModule],
  controllers: [StyleController],
  providers: [
    { provide: RUNS_REDIS_URL, useValue: env.REDIS_URL },
    { provide: RUN_QUEUE, useClass: BullRunQueue },
    { provide: RUNS_CONFIG, useValue: { runBudgetCap: env.UNIT_BUDGET_PER_RUN } },
    { provide: UPLOAD_CONFIG, useValue: { maxUploadBytes: env.MAX_UPLOAD_BYTES } },
    // The samples sit beside the recordings, so wherever replay works the sample photos are there.
    { provide: STYLE_SAMPLES, useValue: { dir: path.resolve(env.YOUCAM_FIXTURES_DIR, '..', 'own'), sets: sampleSets } },
    StyleService,
  ],
})
export class StyleModule {}

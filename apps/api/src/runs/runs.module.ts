import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { env } from '../config/env';
import { GuardModule } from '../guard/guard.module';
import { StorageModule } from '../storage/storage.module';
import { PROFILE_LOCK_REDIS_URL, ProfileLock } from './profile-lock';
import { BullRunQueue, RUNS_REDIS_URL, RUN_QUEUE } from './run.queue';
import { RunWorker } from './run.worker';
import { RUNS_CONFIG, RunsService } from './runs.service';
import { RunsController } from './runs.controller';
import { AssistantService } from '../agent/assistant.service';
import { ModelModule } from '../agent/model.module';
import { RateLimitService } from '../auth/rate-limit.service';

@Module({
  imports: [GuardModule, StorageModule, AgentModule, ModelModule],
  controllers: [RunsController],
  providers: [
    { provide: RUNS_REDIS_URL, useValue: env.REDIS_URL },
    { provide: PROFILE_LOCK_REDIS_URL, useValue: env.REDIS_URL },
    ProfileLock,
    { provide: RUNS_CONFIG, useValue: { runBudgetCap: env.UNIT_BUDGET_PER_RUN } },
    { provide: RUN_QUEUE, useClass: BullRunQueue },
    RunsService,
    RunWorker,
    AssistantService,
    RateLimitService,
  ],
  exports: [RunWorker, RunsService],
})
export class RunsModule {}

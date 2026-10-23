import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { SafetyReviewer } from '../agent/safety-reviewer';
import { env } from '../config/env';
import { GuardModule } from '../guard/guard.module';
import { ReflectionsController } from './reflections.controller';
import { REFLECTION_KEY, ReflectionsService, SAFETY_REVIEWER } from './reflections.service';
import { BullSafetyQueue, SAFETY_QUEUE, SAFETY_REDIS_URL } from './safety.queue';
import { SafetyWorker } from './safety.worker';

@Module({
  imports: [GuardModule, AgentModule],
  controllers: [ReflectionsController],
  providers: [
    { provide: REFLECTION_KEY, useValue: env.DATA_KEY },
    { provide: SAFETY_REDIS_URL, useValue: env.REDIS_URL },
    { provide: SAFETY_QUEUE, useClass: BullSafetyQueue },
    { provide: SAFETY_REVIEWER, useExisting: SafetyReviewer },
    ReflectionsService,
    SafetyWorker,
  ],
  exports: [ReflectionsService, SafetyWorker],
})
export class ReflectionsModule {}

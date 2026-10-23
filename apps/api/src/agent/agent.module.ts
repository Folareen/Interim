import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { YoucamModule } from '../youcam/youcam.module';
import { AgentService } from './agent.service';
import { ModelModule } from './model.module';
import { Planner } from './planner';

@Module({
  imports: [YoucamModule, LedgerModule, ModelModule],
  providers: [Planner, AgentService],
  exports: [AgentService],
})
export class AgentModule {}

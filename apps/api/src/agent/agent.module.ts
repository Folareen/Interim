import { Module } from '@nestjs/common';
import { YoucamModule } from '../youcam/youcam.module';

@Module({ imports: [YoucamModule] })
export class AgentModule {}

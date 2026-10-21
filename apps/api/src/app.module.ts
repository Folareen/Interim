import { Module } from '@nestjs/common';
import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { DbModule } from './db/db.module';
import { GuardModule } from './guard/guard.module';
import { HealthController } from './health/health.controller';
import { LedgerModule } from './ledger/ledger.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RunsModule } from './runs/runs.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { TemplatesModule } from './templates/templates.module';
import { YoucamModule } from './youcam/youcam.module';

@Module({
  imports: [
    DbModule,
    AuthModule,
    CleanupModule,
    ProfilesModule,
    SnapshotsModule,
    RunsModule,
    TemplatesModule,
    LedgerModule,
    YoucamModule,
    AgentModule,
    GuardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

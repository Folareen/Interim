import { Module } from '@nestjs/common';
import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { DbModule } from './db/db.module';
import { DemoModule } from './demo/demo.module';
import { GuardModule } from './guard/guard.module';
import { HealthController } from './health/health.controller';
import { LedgerModule } from './ledger/ledger.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ReflectionsModule } from './reflections/reflections.module';
import { RunsModule } from './runs/runs.module';
import { SharesModule } from './shares/shares.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { TemplatesModule } from './templates/templates.module';
import { YoucamModule } from './youcam/youcam.module';

@Module({
  imports: [
    DbModule,
    DemoModule,
    AuthModule,
    CatalogModule,
    CleanupModule,
    NotificationsModule,
    ProfilesModule,
    ReflectionsModule,
    SnapshotsModule,
    RunsModule,
    SharesModule,
    TemplatesModule,
    LedgerModule,
    YoucamModule,
    AgentModule,
    GuardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

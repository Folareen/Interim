import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { OWNER_CONFIG, OwnerService } from './owner.service';
import { OwnerGuard } from './owner.guard';

@Module({
  providers: [
    {
      provide: OWNER_CONFIG,
      useValue: {
        secret: env.SESSION_SECRET,
        secureCookie: env.NODE_ENV === 'production',
      },
    },
    OwnerService,
    OwnerGuard,
  ],
  exports: [OwnerService, OwnerGuard],
})
export class GuardModule {}

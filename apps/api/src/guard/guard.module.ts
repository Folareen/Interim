import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { AccountGuard } from './account.guard';
import { OWNER_CONFIG } from './config';
import { OwnerService } from './owner.service';
import { OwnerGuard } from './owner.guard';
import { SessionService } from './session.service';

@Module({
  providers: [
    {
      provide: OWNER_CONFIG,
      useValue: {
        secret: env.SESSION_SECRET,
        secureCookie: env.NODE_ENV === 'production',
      },
    },
    SessionService,
    OwnerService,
    OwnerGuard,
    AccountGuard,
  ],
  exports: [OwnerService, OwnerGuard, SessionService, AccountGuard, OWNER_CONFIG],
})
export class GuardModule {}

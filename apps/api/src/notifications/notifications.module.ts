import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { GuardModule } from '../guard/guard.module';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATIONS_REDIS_URL, NotificationsWorker } from './notifications.worker';
import { NotificationsService } from './notifications.service';
import { PUSH_SENDER, VAPID_CONFIG, WebPushSender } from './push-sender';

@Module({
  imports: [GuardModule],
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATIONS_REDIS_URL, useValue: env.REDIS_URL },
    {
      provide: VAPID_CONFIG,
      useValue: { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || env.WEB_ORIGIN },
    },
    { provide: PUSH_SENDER, useFactory: (vapid: ConstructorParameters<typeof WebPushSender>[0]) => new WebPushSender(vapid), inject: [VAPID_CONFIG] },
    NotificationsService,
    NotificationsWorker,
  ],
  exports: [NotificationsService, NotificationsWorker],
})
export class NotificationsModule {}

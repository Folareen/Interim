import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { MAIL_CONFIG, MailService } from './mail.service';

@Module({
  providers: [
    {
      provide: MAIL_CONFIG,
      useValue: {
        mode: env.MAIL_MODE,
        apiKey: env.BREVO_API_KEY,
        fromEmail: env.MAIL_FROM_EMAIL,
        fromName: env.MAIL_FROM_NAME,
      },
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}

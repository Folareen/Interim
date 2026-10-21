import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { GuardModule } from '../guard/guard.module';
import { MailModule } from '../mail/mail.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { AuthController } from './auth.controller';
import { AUTH_CONFIG, AuthService } from './auth.service';
import { GOOGLE_CONFIG, GoogleService } from './google.service';
import { PasswordService } from './password.service';
import { RateLimitService } from './rate-limit.service';

@Module({
  imports: [GuardModule, MailModule, ProfilesModule],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useValue: { webOrigin: env.WEB_ORIGIN } },
    {
      provide: GOOGLE_CONFIG,
      useValue: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: `${env.WEB_ORIGIN}/api/auth/google/callback`,
      },
    },
    AuthService,
    GoogleService,
    PasswordService,
    RateLimitService,
  ],
})
export class AuthModule {}

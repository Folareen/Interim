import {
  deleteAccountSchema,
  emailLinkRequestSchema,
  linkTokenSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@interim/types';
import type {
  AuthConfig as AuthConfigResponse,
  DeleteAccountInput,
  EmailLinkRequest,
  LinkToken,
  LoginInput,
  Me,
  RegisterInput,
  ResetPasswordInput,
} from '@interim/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AccountGuard, CurrentAccount } from '../guard/account.guard';
import { type AccountSession, SessionService } from '../guard/session.service';
import { ZodPipe } from '../guard/zod.pipe';
import { AUTH_CONFIG, AuthService } from './auth.service';
import type { AuthConfig } from './auth.service';
import { GoogleService, googleAttemptSchema } from './google.service';

const GOOGLE_COOKIE = 'interim_oauth';
const GOOGLE_COOKIE_MS = 10 * 60 * 1000;
const callbackQuerySchema = z.object({ code: z.string().min(1), state: z.string().min(1) });
const startQuerySchema = z.object({ next: z.string().optional() });

/** Keeps a return address on this site, so the sign in cannot be used to send a person elsewhere. */
function localPath(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

const addressOf = (req: Request) => req.ip ?? 'unknown';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GoogleService) private readonly google: GoogleService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Get('config')
  options(): AuthConfigResponse {
    return { google: this.google.enabled };
  }

  @HttpCode(202)
  @Post('register')
  async register(@Body(new ZodPipe(registerSchema)) body: RegisterInput, @Req() req: Request): Promise<void> {
    await this.auth.register(body, addressOf(req));
  }

  @HttpCode(200)
  @Post('login')
  login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    return this.auth.login(body, addressOf(req), res);
  }

  @HttpCode(202)
  @Post('magic')
  async requestMagic(@Body(new ZodPipe(emailLinkRequestSchema)) body: EmailLinkRequest, @Req() req: Request): Promise<void> {
    await this.auth.requestMagicLink(body, addressOf(req));
  }

  @HttpCode(200)
  @Post('magic/use')
  useMagic(
    @Body(new ZodPipe(linkTokenSchema)) body: LinkToken,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    return this.auth.useMagicLink(body, addressOf(req), res);
  }

  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(
    @Body(new ZodPipe(linkTokenSchema)) body: LinkToken,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    return this.auth.confirmEmail(body, addressOf(req), res);
  }

  @HttpCode(202)
  @Post('password/forgot')
  async forgot(@Body(new ZodPipe(emailLinkRequestSchema)) body: EmailLinkRequest, @Req() req: Request): Promise<void> {
    await this.auth.requestPasswordReset(body, addressOf(req));
  }

  @HttpCode(200)
  @Post('password/reset')
  reset(
    @Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    return this.auth.resetPassword(body, addressOf(req), res);
  }

  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.end(req, res);
  }

  @UseGuards(AccountGuard)
  @Get('me')
  me(@CurrentAccount() account: AccountSession): Promise<Me> {
    return this.auth.me(account);
  }

  @UseGuards(AccountGuard)
  @HttpCode(204)
  @Delete('account')
  async remove(
    @CurrentAccount() account: AccountSession,
    @Body(new ZodPipe(deleteAccountSchema)) body: DeleteAccountInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.deleteAccount(account, body, addressOf(req), res);
  }

  // The person's browser leaves for Google here and comes back to the callback, so both are plain redirects.
  @Get('google/start')
  googleStart(@Query() query: unknown, @Res() res: Response): void {
    if (!this.google.enabled) throw new NotFoundException();
    const next = startQuerySchema.safeParse(query).data?.next;
    const { url, attempt } = this.google.begin();
    res.cookie(GOOGLE_COOKIE, JSON.stringify({ ...attempt, next: localPath(next, '/account') }), {
      httpOnly: true,
      secure: this.config.webOrigin.startsWith('https:'),
      sameSite: 'lax',
      maxAge: GOOGLE_COOKIE_MS,
      path: '/',
    });
    res.redirect(url);
  }

  @Get('google/callback')
  async googleCallback(@Query() query: unknown, @Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.google.enabled) throw new NotFoundException();
    const failed = `${this.config.webOrigin}/signin?error=google`;
    const cookie = googleAttemptSchema.safeParse(parseJson(req.cookies?.[GOOGLE_COOKIE]));
    res.clearCookie(GOOGLE_COOKIE, { path: '/' });
    const params = callbackQuerySchema.safeParse(query);
    // A denied prompt arrives with an error and no code. A state that does not match is a forged return.
    if (!cookie.success || !params.success || params.data.state !== cookie.data.state) {
      res.redirect(failed);
      return;
    }
    try {
      const identity = await this.google.finish(params.data.code, cookie.data);
      await this.auth.signInWithGoogle(identity, res);
    } catch {
      res.redirect(failed);
      return;
    }
    res.redirect(`${this.config.webOrigin}${localPath(cookie.data.next, '/account')}`);
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

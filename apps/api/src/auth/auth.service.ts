import { type Db, account, authToken, profile, recoveryCode } from '@interim/db';
import type {
  ChangeEmailInput,
  ConfirmEmailChangeInput,
  DeleteAccountInput,
  EmailLinkRequest,
  LinkToken,
  LiveLocale,
  LoginInput,
  Me,
  NewRecoveryCodesInput,
  RecoverAccountInput,
  RecoveryCodes,
  RegisterInput,
  ResetPasswordInput,
} from '@interim/types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { and, count, eq, gt, isNull, or } from 'drizzle-orm';
import type { Response } from 'express';
import { DB } from '../db/db.token';
import type { AccountSession } from '../guard/session.service';
import { SessionService } from '../guard/session.service';
import { accountRef } from '../guard/owner.service';
import { hashToken, randomToken } from '../guard/token';
import { MailService } from '../mail/mail.service';
import { ProfilesService } from '../profiles/profiles.service';
import { type EmailKind, buildEmail, buildEmailChangedNotice } from './auth-mail';
import { PasswordService } from './password.service';
import { formatRecoveryCode, newRecoveryCode } from './recovery-code';
import { RateLimitService } from './rate-limit.service';
import { OWNER_CONFIG, type OwnerConfig } from '../guard/config';

/** Where emailed links point. */
export interface AuthConfig {
  webOrigin: string;
}
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

type TokenPurpose = (typeof authToken.$inferSelect)['purpose'];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// A sign-in link is short lived because it signs a person in with no other proof.
const LINK_TTL_MS: Record<TokenPurpose, number> = {
  verify_email: 24 * HOUR_MS,
  magic_link: 15 * MINUTE_MS,
  reset_password: 30 * MINUTE_MS,
  change_email: 24 * HOUR_MS,
  recover_account: 24 * HOUR_MS,
};
const RECOVERY_CODES = 8;

/** Accounts, sign in, emailed links and bringing device profiles into an account (docs/product/spec.md section 12b). */
@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(OWNER_CONFIG) private readonly secrets: OwnerConfig,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
    @Inject(ProfilesService) private readonly profiles: ProfilesService,
  ) {}

  /**
   * Creates an account that must confirm its email, or refreshes one that has not yet. Always looks the same
   * to the caller, so the form cannot be used to find out who has an account.
   */
  async register(input: RegisterInput, ip: string): Promise<void> {
    await this.limits.hit('register-ip', ip, 10, HOUR_MS);
    await this.limits.hit('register-email', input.email, 5, HOUR_MS);
    const passwordHash = await this.passwords.hash(input.password);
    const existing = await this.find(input.email);
    if (existing?.emailVerifiedAt) {
      this.sendLater('exists', input.locale, input.email, `${this.config.webOrigin}/signin`);
      return;
    }
    if (existing) await this.db.update(account).set({ passwordHash }).where(eq(account.id, existing.id));
    else await this.db.insert(account).values({ email: input.email, passwordHash });
    await this.sendLink('verify', 'verify_email', input.locale, input.email, '/auth/confirm?kind=verify');
  }

  /**
   * Signs in with email and password.
   * @throws UnauthorizedException for a wrong email or password, which are not told apart.
   * @throws ForbiddenException when the password is right but the email is not yet confirmed.
   */
  async login(input: LoginInput, ip: string, res: Response): Promise<Me> {
    await this.limits.hit('login-ip', ip, 60, 15 * MINUTE_MS);
    await this.limits.hit('login-email', input.email, 8, 15 * MINUTE_MS);
    const found = await this.find(input.email);
    const matches = await this.passwords.verify(input.password, found?.passwordHash ?? null);
    if (!found || !matches) throw new UnauthorizedException();
    if (!found.emailVerifiedAt) throw new ForbiddenException();
    await this.sessions.start(res, found.id);
    return this.me({ accountId: found.id, email: found.email });
  }

  /** Sends a sign-in link. The account is created when the link is used, so this never says whether one exists. */
  async requestMagicLink(input: EmailLinkRequest, ip: string): Promise<void> {
    await this.limits.hit('link-ip', ip, 20, HOUR_MS);
    await this.limits.hit('link-email', input.email, 5, HOUR_MS);
    await this.sendLink('magic', 'magic_link', input.locale, input.email, '/auth/confirm?kind=magic');
  }

  /** Signs in with a link, creating the account on first use. The link proves the inbox, so the email counts as confirmed. */
  async useMagicLink(input: LinkToken, ip: string, res: Response): Promise<Me> {
    await this.limits.hit('consume-ip', ip, 30, 15 * MINUTE_MS);
    const email = await this.consume(input.token, 'magic_link');
    const found = await this.find(email);
    const id = found ? await this.confirmByInbox(found) : await this.create({ email, emailVerifiedAt: new Date() });
    await this.sessions.start(res, id);
    return this.me({ accountId: id, email });
  }

  /** Confirms the email of a password account from its link, and signs in. */
  async confirmEmail(input: LinkToken, ip: string, res: Response): Promise<Me> {
    await this.limits.hit('consume-ip', ip, 30, 15 * MINUTE_MS);
    const email = await this.consume(input.token, 'verify_email');
    const found = await this.find(email);
    if (!found) throw new BadRequestException('invalid_link');
    await this.db.update(account).set({ emailVerifiedAt: new Date() }).where(eq(account.id, found.id));
    await this.sessions.start(res, found.id);
    return this.me({ accountId: found.id, email });
  }

  /** Sends a password reset link if the address has an account. Looks the same either way. */
  async requestPasswordReset(input: EmailLinkRequest, ip: string): Promise<void> {
    await this.limits.hit('link-ip', ip, 20, HOUR_MS);
    await this.limits.hit('link-email', input.email, 5, HOUR_MS);
    if (!(await this.find(input.email))) return;
    await this.sendLink('reset', 'reset_password', input.locale, input.email, '/reset');
  }

  /** Sets a new password from a reset link, signs every other browser out, and signs this one in. */
  async resetPassword(input: ResetPasswordInput, ip: string, res: Response): Promise<Me> {
    await this.limits.hit('consume-ip', ip, 30, 15 * MINUTE_MS);
    const email = await this.consume(input.token, 'reset_password');
    const found = await this.find(email);
    if (!found) throw new BadRequestException('invalid_link');
    const passwordHash = await this.passwords.hash(input.password);
    await this.db
      .update(account)
      .set({ passwordHash, emailVerifiedAt: found.emailVerifiedAt ?? new Date() })
      .where(eq(account.id, found.id));
    await this.sessions.endAll(found.id);
    await this.sessions.start(res, found.id);
    return this.me({ accountId: found.id, email });
  }

  /** Signs in a verified Google identity, linking it to the account with the same email or creating one. */
  async signInWithGoogle(identity: { sub: string; email: string }, res: Response): Promise<void> {
    const [bySub] = await this.db.select().from(account).where(eq(account.googleSub, identity.sub));
    if (bySub) {
      await this.sessions.start(res, bySub.id);
      return;
    }
    const byEmail = await this.find(identity.email);
    if (byEmail?.googleSub) throw new ConflictException();
    const id = byEmail
      ? await this.confirmByInbox(byEmail)
      : await this.create({ email: identity.email, emailVerifiedAt: new Date() });
    await this.db.update(account).set({ googleSub: identity.sub }).where(eq(account.id, id));
    await this.sessions.start(res, id);
  }

  /** The signed in account. */
  async me(signedIn: AccountSession): Promise<Me> {
    const [row] = await this.db
      .select({ passwordHash: account.passwordHash })
      .from(account)
      .where(eq(account.id, signedIn.accountId));
    if (!row) throw new UnauthorizedException();
    const [codes] = await this.db
      .select({ left: count() })
      .from(recoveryCode)
      .where(and(eq(recoveryCode.accountId, signedIn.accountId), isNull(recoveryCode.usedAt)));
    return { email: signedIn.email, hasPassword: row.passwordHash !== null, recoveryCodes: codes?.left ?? 0 };
  }

  /**
   * Starts moving the account to a new address by emailing a link there. Nothing changes until the link is
   * used, so a typo cannot lock the person out. An address that already has an account is told so instead.
   * @throws ForbiddenException when the account has a password and it was not given or is wrong.
   */
  async requestEmailChange(signedIn: AccountSession, input: ChangeEmailInput, ip: string): Promise<void> {
    await this.limits.hit('change-ip', ip, 20, HOUR_MS);
    await this.limits.hit('change-account', signedIn.accountId, 5, HOUR_MS);
    const found = await this.find(signedIn.email);
    if (!found) throw new UnauthorizedException();
    await this.requirePassword(found, input.password);
    if (input.email === found.email) return;
    if (await this.find(input.email)) {
      this.sendLater('exists', input.locale, input.email, `${this.config.webOrigin}/signin`);
      return;
    }
    await this.sendLink('changeEmail', 'change_email', input.locale, input.email, '/auth/confirm?kind=change', found.id);
  }

  /** Moves the account to the address the link was sent to, and signs in on this browser. */
  async confirmEmailChange(input: ConfirmEmailChangeInput, ip: string, res: Response): Promise<Me> {
    await this.limits.hit('consume-ip', ip, 30, 15 * MINUTE_MS);
    return this.moveEmail(await this.consumeFor(input.token, 'change_email'), input.locale, res);
  }

  /**
   * Replaces the account's recovery codes with a new set and returns them. This is the only time they are
   * readable, because only keyed hashes are kept.
   * @throws ForbiddenException when the account has a password and it was not given or is wrong.
   */
  async createRecoveryCodes(signedIn: AccountSession, input: NewRecoveryCodesInput, ip: string): Promise<RecoveryCodes> {
    await this.limits.hit('login-ip', ip, 60, 15 * MINUTE_MS);
    const found = await this.find(signedIn.email);
    if (!found) throw new UnauthorizedException();
    await this.requirePassword(found, input.password);
    const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
    await this.db.transaction(async (tx) => {
      await tx.delete(recoveryCode).where(eq(recoveryCode.accountId, found.id));
      await tx.insert(recoveryCode).values(codes.map((code) => ({ accountId: found.id, codeHash: this.hashCode(code) })));
    });
    return { codes: codes.map(formatRecoveryCode) };
  }

  /**
   * For someone who lost the inbox: a recovery code proves the account, and a link to the new address proves
   * that inbox. Looks the same whether or not the address, the code or the new address was right.
   */
  async requestRecovery(input: RecoverAccountInput, ip: string): Promise<void> {
    await this.limits.hit('recover-ip', ip, 10, HOUR_MS);
    await this.limits.hit('recover-email', input.email, 5, HOUR_MS);
    const found = await this.find(input.email);
    if (!found || (await this.find(input.newEmail))) return;
    const [spent] = await this.db
      .update(recoveryCode)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(recoveryCode.accountId, found.id),
          eq(recoveryCode.codeHash, this.hashCode(input.code)),
          isNull(recoveryCode.usedAt),
        ),
      )
      .returning({ id: recoveryCode.id });
    if (!spent) return;
    await this.sendLink('recover', 'recover_account', input.locale, input.newEmail, '/auth/confirm?kind=recover', found.id);
  }

  /** Finishes recovery from the link sent to the new address: the account moves there and everyone else is signed out. */
  async confirmRecovery(input: ConfirmEmailChangeInput, ip: string, res: Response): Promise<Me> {
    await this.limits.hit('consume-ip', ip, 30, 15 * MINUTE_MS);
    return this.moveEmail(await this.consumeFor(input.token, 'recover_account'), input.locale, res);
  }

  /**
   * Deletes the account and every profile in it, files included.
   * @throws ForbiddenException when the account has a password and it was not given or is wrong.
   */
  async deleteAccount(signedIn: AccountSession, input: DeleteAccountInput, ip: string, res: Response): Promise<void> {
    await this.limits.hit('login-ip', ip, 60, 15 * MINUTE_MS);
    const found = await this.find(signedIn.email);
    if (!found) throw new UnauthorizedException();
    if (found.passwordHash !== null) {
      await this.limits.hit('login-email', found.email, 8, 15 * MINUTE_MS);
      if (!input.password || !(await this.passwords.verify(input.password, found.passwordHash))) {
        throw new ForbiddenException();
      }
    }
    const owner = { ref: accountRef(found.id) };
    const owned = await this.db.select({ id: profile.id }).from(profile).where(eq(profile.ownerRef, owner.ref));
    for (const { id } of owned) await this.profiles.remove(id, owner);
    await this.db.delete(authToken).where(eq(authToken.email, found.email));
    await this.db.delete(account).where(eq(account.id, found.id));
    res.clearCookie('interim_session', { path: '/' });
  }

  private hashCode(code: string): string {
    return hashToken(this.secrets.secret, `recovery:${code}`);
  }

  // A password is the proof for a signed in account that has one. Accounts with none rely on the session.
  private async requirePassword(found: typeof account.$inferSelect, password: string | undefined): Promise<void> {
    if (found.passwordHash === null) return;
    await this.limits.hit('login-email', found.email, 8, 15 * MINUTE_MS);
    if (!password || !(await this.passwords.verify(password, found.passwordHash))) throw new ForbiddenException();
  }

  // Shared by changing the address and recovering the account: both end at a link proven to reach the new inbox.
  private async moveEmail(link: { email: string; accountId: string }, locale: LiveLocale, res: Response): Promise<Me> {
    const [current] = await this.db.select().from(account).where(eq(account.id, link.accountId));
    if (!current) throw new BadRequestException('invalid_link');
    if (await this.find(link.email)) throw new ConflictException();
    await this.db
      .update(account)
      .set({ email: link.email, emailVerifiedAt: new Date() })
      .where(eq(account.id, current.id));
    // Links still out for the old address, such as a sign-in link, must not work for whoever holds that inbox now.
    await this.db.delete(authToken).where(eq(authToken.email, current.email));
    await this.sessions.endAll(current.id);
    await this.sessions.start(res, current.id);
    this.mail.send(buildEmailChangedNotice(locale, current.email)).catch((cause: unknown) => {
      this.log.error(`Email could not be sent: ${cause instanceof Error ? cause.message : 'unknown error'}`);
    });
    return this.me({ accountId: current.id, email: link.email });
  }

  private async find(email: string) {
    const [row] = await this.db.select().from(account).where(eq(account.email, email));
    return row;
  }

  private async create(values: { email: string; emailVerifiedAt: Date }): Promise<string> {
    const [row] = await this.db.insert(account).values(values).returning({ id: account.id });
    if (!row) throw new Error('Account insert returned no row');
    return row.id;
  }

  // Someone who registered with a password but never confirmed may be an attacker who typed another
  // person's address. Proof of the inbox through a link or Google discards that password and its sessions.
  private async confirmByInbox(found: typeof account.$inferSelect): Promise<string> {
    if (found.emailVerifiedAt) return found.id;
    await this.db
      .update(account)
      .set({ emailVerifiedAt: new Date(), passwordHash: null })
      .where(eq(account.id, found.id));
    await this.sessions.endAll(found.id);
    return found.id;
  }

  private async sendLink(
    kind: EmailKind,
    purpose: TokenPurpose,
    locale: LiveLocale,
    email: string,
    path: string,
    accountId?: string,
  ) {
    const token = randomToken();
    // An older unused link for the same purpose stops working once a new one is asked for.
    const same = accountId ? or(eq(authToken.email, email), eq(authToken.accountId, accountId)) : eq(authToken.email, email);
    await this.db.delete(authToken).where(and(same, eq(authToken.purpose, purpose), isNull(authToken.usedAt)));
    await this.db.insert(authToken).values({
      email,
      accountId,
      purpose,
      tokenHash: hashToken(this.secrets.secret, token),
      expiresAt: new Date(Date.now() + LINK_TTL_MS[purpose]),
    });
    const separator = path.includes('?') ? '&' : '?';
    this.sendLater(kind, locale, email, `${this.config.webOrigin}${path}${separator}token=${token}`);
  }

  // The response must not depend on whether mail was sent to a real account, so sending is not waited for.
  private sendLater(kind: EmailKind, locale: LiveLocale, to: string, link: string): void {
    this.mail.send(buildEmail(kind, locale, to, link)).catch((cause: unknown) => {
      this.log.error(`Email could not be sent: ${cause instanceof Error ? cause.message : 'unknown error'}`);
    });
  }

  private async consume(token: string, purpose: TokenPurpose): Promise<string> {
    return (await this.consumeRow(token, purpose)).email;
  }

  // Links that move an account always name it, so one without an account is as good as an expired one.
  private async consumeFor(token: string, purpose: TokenPurpose): Promise<{ email: string; accountId: string }> {
    const { email, accountId } = await this.consumeRow(token, purpose);
    if (!accountId) throw new BadRequestException('invalid_link');
    return { email, accountId };
  }

  private async consumeRow(token: string, purpose: TokenPurpose) {
    const [row] = await this.db
      .update(authToken)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(authToken.tokenHash, hashToken(this.secrets.secret, token)),
          eq(authToken.purpose, purpose),
          isNull(authToken.usedAt),
          gt(authToken.expiresAt, new Date()),
        ),
      )
      .returning({ email: authToken.email, accountId: authToken.accountId });
    if (!row) throw new BadRequestException('invalid_link');
    return row;
  }
}

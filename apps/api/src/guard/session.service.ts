import { type Db, account, session } from '@interim/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { DB } from '../db/db.token';
import { OWNER_CONFIG, type OwnerConfig } from './config';
import { hashToken, randomToken } from './token';

/** Name of the cookie that carries the session token. */
export const SESSION_COOKIE = 'interim_session';
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MS = 30 * DAY_MS;
// A session in use is extended, so someone who checks in every few weeks is not signed out between.
const EXTEND_BELOW_MS = SESSION_MS / 2;

/** Who a session belongs to. */
export interface AccountSession {
  accountId: string;
  email: string;
}

/** Sessions for signed in accounts: an opaque cookie token whose keyed hash is the only thing stored. */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(OWNER_CONFIG) private readonly config: OwnerConfig,
  ) {}

  /** Signs the account in on this browser and sets the cookie. */
  async start(res: Response, accountId: string): Promise<void> {
    const token = randomToken();
    await this.db.insert(session).values({
      accountId,
      tokenHash: hashToken(this.config.secret, token),
      expiresAt: new Date(Date.now() + SESSION_MS),
    });
    this.setCookie(res, token);
  }

  /** The account behind the request's session cookie, or undefined when signed out or expired. */
  async resolve(req: Request, res?: Response): Promise<AccountSession | undefined> {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token === '') return undefined;
    const tokenHash = hashToken(this.config.secret, token);
    const [row] = await this.db
      .select({ accountId: account.id, email: account.email, expiresAt: session.expiresAt })
      .from(session)
      .innerJoin(account, eq(account.id, session.accountId))
      .where(and(eq(session.tokenHash, tokenHash), gt(session.expiresAt, new Date())));
    if (!row) return undefined;
    if (res && row.expiresAt.getTime() - Date.now() < EXTEND_BELOW_MS) {
      await this.db
        .update(session)
        .set({ expiresAt: new Date(Date.now() + SESSION_MS) })
        .where(eq(session.tokenHash, tokenHash));
      this.setCookie(res, token);
    }
    return { accountId: row.accountId, email: row.email };
  }

  /** Signs this browser out. */
  async end(req: Request, res: Response): Promise<void> {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token !== '') {
      await this.db.delete(session).where(eq(session.tokenHash, hashToken(this.config.secret, token)));
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  /** Signs the account out everywhere, as after a password reset. */
  async endAll(accountId: string): Promise<void> {
    await this.db.delete(session).where(eq(session.accountId, accountId));
  }

  private setCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: 'lax',
      maxAge: SESSION_MS,
      path: '/',
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OWNER_CONFIG, type OwnerConfig } from './config';
import { SessionService } from './session.service';
import { hashToken, randomToken } from './token';

/** Name of the cookie that carries the device owner token. */
export const OWNER_COOKIE = 'interim_owner';
const OWNER_COOKIE_MAX_AGE_MS = 730 * 24 * 60 * 60 * 1000; // matches the 24 month retention ceiling

/** Who is calling. `ref` is what `profile.owner_ref` stores; it never holds a raw token. */
export interface Owner {
  ref: string;
}

/** A request that `OwnerGuard` has resolved an owner for. */
export type OwnedRequest = Request & { owner?: Owner };

/** The `owner_ref` of every profile an account owns. Device refs are 64 hex characters, so the two never collide. */
export function accountRef(accountId: string): string {
  return `account:${accountId}`;
}

/** Identifies the person calling: their account when signed in, else this device's cookie (docs/backend.md, Identity). */
@Injectable()
export class OwnerService {
  constructor(
    @Inject(OWNER_CONFIG) private readonly config: OwnerConfig,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /** The account when the request has a session, else the device. Pass `res` so a session in use is extended. */
  async resolve(req: Request, res?: Response): Promise<Owner | undefined> {
    const signedIn = await this.sessions.resolve(req, res);
    if (signedIn) return { ref: accountRef(signedIn.accountId) };
    return this.resolveDevice(req);
  }

  /** The device cookie alone. A signed in person uses it to bring profiles made before sign-in into their account. */
  resolveDevice(req: Request): Owner | undefined {
    const token: unknown = req.cookies?.[OWNER_COOKIE];
    if (typeof token === 'string' && token !== '') return { ref: hashToken(this.config.secret, token) };
    return undefined;
  }

  /** Starts a new device identity and sets its cookie on the response. */
  mint(res: Response): Owner {
    const token = randomToken();
    res.cookie(OWNER_COOKIE, token, {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: 'lax',
      maxAge: OWNER_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    return { ref: hashToken(this.config.secret, token) };
  }
}

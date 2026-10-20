import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

export const OWNER_COOKIE = 'interim_owner';
const OWNER_COOKIE_MAX_AGE_MS = 730 * 24 * 60 * 60 * 1000; // matches the 24 month retention ceiling

/** Who is calling. `ref` is what `profile.owner_ref` stores; it never holds the raw token. */
export interface Owner {
  ref: string;
}

/** A request that `OwnerGuard` has resolved an owner for. */
export type OwnedRequest = Request & { owner?: Owner };

export interface OwnerConfig {
  /** Keys the owner token hash. */
  secret: string;
  secureCookie: boolean;
}
export const OWNER_CONFIG = Symbol('OWNER_CONFIG');

/** Identifies the person calling by their owner cookie (docs/backend.md, Identity). */
@Injectable()
export class OwnerService {
  constructor(@Inject(OWNER_CONFIG) private readonly config: OwnerConfig) {}

  /** Reads the caller from the owner cookie. */
  resolve(req: Request): Owner | undefined {
    const token: unknown = req.cookies?.[OWNER_COOKIE];
    if (typeof token === 'string' && token !== '') return { ref: this.hash(token) };
    return undefined;
  }

  /** Starts a new person identity and sets its cookie on the response. */
  mint(res: Response): Owner {
    const token = randomBytes(32).toString('base64url');
    res.cookie(OWNER_COOKIE, token, {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: 'lax',
      maxAge: OWNER_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    return { ref: this.hash(token) };
  }

  private hash(token: string): string {
    return createHmac('sha256', this.config.secret).update(token).digest('hex');
  }
}

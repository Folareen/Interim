import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

export const OWNER_COOKIE = 'interim_owner';
const OWNER_COOKIE_MAX_AGE_MS = 730 * 24 * 60 * 60 * 1000; // matches the 24 month retention ceiling

/** Who is calling. `ref` is what `profile.owner_ref` stores; it never holds the raw token. */
export interface Owner {
  kind: 'person' | 'partner';
  ref: string;
}

/** A request that `OwnerGuard` has resolved an owner for. */
export type OwnedRequest = Request & { owner?: Owner };

export interface OwnerConfig {
  /** Keys the owner token hash. */
  secret: string;
  /** `PARTNER_API_KEYS`: comma separated `id:key` pairs. */
  partnerKeys: string;
  secureCookie: boolean;
}
export const OWNER_CONFIG = Symbol('OWNER_CONFIG');

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Identifies the caller by a partner key or the owner cookie (docs/backend.md, Identity). */
@Injectable()
export class OwnerService {
  private readonly partners: { id: string; keyDigest: Buffer }[];

  constructor(@Inject(OWNER_CONFIG) private readonly config: OwnerConfig) {
    this.partners = config.partnerKeys
      .split(',')
      .map((pair) => pair.trim())
      .filter((pair) => pair !== '')
      .map((pair) => {
        const [id, key] = pair.split(':');
        if (!id || !key) throw new Error('PARTNER_API_KEYS must be id:key pairs separated by commas');
        return { id, keyDigest: digest(key) };
      });
  }

  /**
   * Reads the caller from a bearer partner key, else from the owner cookie.
   * @throws UnauthorizedException when a bearer key is sent but matches no partner.
   */
  resolve(req: Request): Owner | undefined {
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (bearer) return { kind: 'partner', ref: this.partnerRef(bearer) };

    const token: unknown = req.cookies?.[OWNER_COOKIE];
    if (typeof token === 'string' && token !== '') return { kind: 'person', ref: this.hash(token) };
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
    return { kind: 'person', ref: this.hash(token) };
  }

  private hash(token: string): string {
    return createHmac('sha256', this.config.secret).update(token).digest('hex');
  }

  private partnerRef(key: string): string {
    const presented = digest(key);
    // Compare against every partner so timing does not reveal which one matched.
    const checked = this.partners.map((p) => ({ id: p.id, same: timingSafeEqual(p.keyDigest, presented) }));
    const match = checked.find((p) => p.same);
    if (!match) throw new UnauthorizedException();
    return `partner:${match.id}`;
  }
}

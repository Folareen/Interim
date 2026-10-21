import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionService } from './session.service';

/** Who is calling. `ref` is what `profile.owner_ref` stores; it never holds a raw token. */
export interface Owner {
  ref: string;
}

/** A request that `OwnerGuard` has resolved an owner for. */
export type OwnedRequest = Request & { owner?: Owner };

/** The `owner_ref` of every profile an account owns. */
export function accountRef(accountId: string): string {
  return `account:${accountId}`;
}

/** Identifies the person calling by their signed in account (docs/backend.md, Identity). */
@Injectable()
export class OwnerService {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  /** The account behind the request's session, or undefined when signed out. Pass `res` so a session in use is extended. */
  async resolve(req: Request, res?: Response): Promise<Owner | undefined> {
    const signedIn = await this.sessions.resolve(req, res);
    return signedIn ? { ref: accountRef(signedIn.accountId) } : undefined;
  }
}

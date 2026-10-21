import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type AccountSession, SessionService } from './session.service';

type SessionRequest = Request & { account?: AccountSession };

/** Requires a signed in account. A device cookie alone is not enough on these routes. */
@Injectable()
export class AccountGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<SessionRequest>();
    const signedIn = await this.sessions.resolve(req, http.getResponse<Response>());
    if (!signedIn) throw new UnauthorizedException();
    req.account = signedIn;
    return true;
  }
}

/** The account resolved by `AccountGuard`. Only valid on routes that use the guard. */
export const CurrentAccount = createParamDecorator((_data: unknown, context: ExecutionContext): AccountSession => {
  const signedIn = context.switchToHttp().getRequest<SessionRequest>().account;
  if (!signedIn) throw new UnauthorizedException();
  return signedIn;
});

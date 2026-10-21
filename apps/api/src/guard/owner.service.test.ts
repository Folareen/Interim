import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { OwnerService, accountRef } from './owner.service';
import type { AccountSession, SessionService } from './session.service';

function ownerService(signedIn?: AccountSession) {
  return new OwnerService({ resolve: vi.fn().mockResolvedValue(signedIn) } as unknown as SessionService);
}
const request = { cookies: {}, headers: {} } as unknown as Request;

describe('OwnerService', () => {
  it('is the signed in account, by its ref', async () => {
    const owner = await ownerService({ accountId: 'abc', email: 'a@b.co' }).resolve(request);
    expect(owner).toEqual({ ref: accountRef('abc') });
    expect(owner?.ref).toBe('account:abc');
  });

  it('is nobody when signed out, whatever else the request carries', async () => {
    const withBearer = { cookies: { interim_owner: 'old-device-token' }, headers: { authorization: 'Bearer key' } } as unknown as Request;
    expect(await ownerService().resolve(withBearer)).toBeUndefined();
  });
});

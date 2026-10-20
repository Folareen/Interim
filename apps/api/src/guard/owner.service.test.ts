import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { OWNER_COOKIE, OwnerService } from './owner.service';

const config = { secret: 's'.repeat(32), secureCookie: true };
const service = new OwnerService(config);

function request(parts: { authorization?: string; cookie?: string }) {
  return {
    headers: { authorization: parts.authorization },
    cookies: parts.cookie === undefined ? {} : { [OWNER_COOKIE]: parts.cookie },
  } as unknown as Request;
}

describe('OwnerService', () => {
  it('ignores bearer keys: only the owner cookie identifies a caller', () => {
    expect(service.resolve(request({ authorization: 'Bearer key-two' }))).toBeUndefined();
  });

  it('hashes the cookie token so the raw token is never the owner ref', () => {
    const owner = service.resolve(request({ cookie: 'token' }));
    expect(owner?.ref).toMatch(/^[0-9a-f]{64}$/);
    expect(owner?.ref).not.toContain('token');
  });

  it('gives the same ref for the same token and different refs for different tokens', () => {
    const a = service.resolve(request({ cookie: 'a' }));
    expect(service.resolve(request({ cookie: 'a' }))).toEqual(a);
    expect(service.resolve(request({ cookie: 'b' }))).not.toEqual(a);
  });

  it('has no owner without a cookie', () => {
    expect(service.resolve(request({}))).toBeUndefined();
  });

  it('mints an httpOnly, SameSite=Lax cookie whose hash matches the returned owner', () => {
    const cookie = vi.fn();
    const owner = service.mint({ cookie } as unknown as Response);
    const [name, token, options] = cookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(name).toBe(OWNER_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
    expect(service.resolve(request({ cookie: token }))).toEqual(owner);
  });
});

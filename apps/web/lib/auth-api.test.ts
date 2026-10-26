import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmEmail,
  confirmEmailChange,
  confirmRecovery,
  createRecoveryCodes,
  deleteAccount,
  login,
  logout,
  recoverAccount,
  register,
  requestEmailChange,
  requestMagicLink,
  resetPassword,
  signInWithLink,
} from './api';
import { authErrorKey } from './auth-error';
import { ApiError } from './api';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const me = { email: 'a@b.co', hasPassword: true, recoveryCodes: 0 };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return { url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
};

describe('auth api client', () => {
  it('registers through the same origin proxy', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await register({ email: 'a@b.co', password: 'a long enough password', locale: 'fr' });
    expect(lastCall()).toEqual({
      url: '/api/auth/register',
      method: 'POST',
      body: { email: 'a@b.co', password: 'a long enough password', locale: 'fr' },
    });
  });

  it.each([
    ['login', () => login({ email: 'a@b.co', password: 'x' }), '/api/auth/login'],
    ['signInWithLink', () => signInWithLink({ token: 'a'.repeat(30) }), '/api/auth/magic/use'],
    ['confirmEmail', () => confirmEmail({ token: 'a'.repeat(30) }), '/api/auth/verify-email'],
    ['confirmEmailChange', () => confirmEmailChange({ token: 'a'.repeat(30), locale: 'en' }), '/api/auth/email/confirm'],
    ['confirmRecovery', () => confirmRecovery({ token: 'a'.repeat(30), locale: 'en' }), '/api/auth/recover/confirm'],
    ['resetPassword', () => resetPassword({ token: 'a'.repeat(30), password: 'a long enough password' }), '/api/auth/password/reset'],
  ])('%s parses the account it gets back', async (_name, call, url) => {
    fetchMock.mockResolvedValueOnce(json(me));
    expect(await call()).toEqual(me);
    expect(lastCall().url).toBe(url);
  });

  it('sends the email change and the recovery request to their routes', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 202 })));
    await requestEmailChange({ email: 'new@b.co', locale: 'en', password: 'secret password' });
    expect(lastCall()).toEqual({
      url: '/api/auth/email/change',
      method: 'POST',
      body: { email: 'new@b.co', locale: 'en', password: 'secret password' },
    });
    const input = { email: 'a@b.co', code: 'ABCDEFGHIJKLMNOP', newEmail: 'new@b.co', locale: 'en' } as const;
    await recoverAccount(input);
    expect(lastCall()).toEqual({ url: '/api/auth/recover', method: 'POST', body: input });
  });

  it('parses the recovery codes it gets back', async () => {
    fetchMock.mockResolvedValueOnce(json({ codes: ['ABCD-EFGH-IJKL-MNOP'] }));
    expect(await createRecoveryCodes({ password: 'secret password' })).toEqual({ codes: ['ABCD-EFGH-IJKL-MNOP'] });
    expect(lastCall().url).toBe('/api/auth/recovery-codes');
    fetchMock.mockResolvedValueOnce(json({ codes: 'nope' }));
    await expect(createRecoveryCodes({})).rejects.toThrow();
  });

  it('rejects an answer that is not an account', async () => {
    fetchMock.mockResolvedValueOnce(json({ email: 5 }));
    await expect(login({ email: 'a@b.co', password: 'x' })).rejects.toThrow();
  });

  it('sends link requests, logout and delete to their routes', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    await requestMagicLink({ email: 'a@b.co', locale: 'en' });
    expect(lastCall().url).toBe('/api/auth/magic');
    await logout();
    expect(lastCall()).toMatchObject({ url: '/api/auth/logout', method: 'POST' });
    await deleteAccount('secret password');
    expect(lastCall()).toEqual({ url: '/api/auth/account', method: 'DELETE', body: { password: 'secret password' } });
  });
});

describe('authErrorKey', () => {
  it.each([
    [new ApiError(401, ''), 'invalid'],
    [new ApiError(403, ''), 'unverified'],
    [new ApiError(429, ''), 'tooMany'],
    [new ApiError(422, ''), 'leaked'],
    [new ApiError(400, ''), 'linkInvalid'],
    [new ApiError(500, ''), 'generic'],
    [new ApiError('network', ''), 'network'],
    [new Error('other'), 'generic'],
  ])('maps %s to %s', (cause, key) => {
    expect(authErrorKey(cause)).toBe(key);
  });
});

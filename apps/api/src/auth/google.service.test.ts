import { UnauthorizedException } from '@nestjs/common';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GoogleService } from './google.service';

const CLIENT_ID = 'client-1.apps.googleusercontent.com';
let privateKey: CryptoKey;
let service: GoogleService;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  service = new GoogleService({
    clientId: CLIENT_ID,
    clientSecret: 'secret',
    redirectUri: 'https://web.test/api/auth/google/callback',
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
});

afterEach(() => vi.unstubAllGlobals());

async function idToken(claims: Record<string, unknown>, overrides: { iss?: string; aud?: string; exp?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(overrides.iss ?? 'https://accounts.google.com')
    .setAudience(overrides.aud ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? '5m')
    .sign(privateKey);
}

function answerWith(token: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id_token: token }) }));
}

const attempt = { verifier: 'v', nonce: 'n1' };
const good = { sub: '123', email: 'Person@Example.com', email_verified: true, nonce: 'n1' };

describe('GoogleService', () => {
  it('is off without a client id', () => {
    expect(new GoogleService({ clientId: '', clientSecret: '', redirectUri: 'x' }).enabled).toBe(false);
    expect(service.enabled).toBe(true);
  });

  it('builds a PKCE request that asks only for openid and email', () => {
    const { url, attempt: made } = service.begin();
    const params = new URL(url).searchParams;
    expect(params.get('scope')).toBe('openid email');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('state')).toBe(made.state);
    expect(params.get('nonce')).toBe(made.nonce);
    expect(params.get('code_challenge')).not.toBe(made.verifier);
  });

  it('accepts a valid token and lower cases the email', async () => {
    answerWith(await idToken(good));
    expect(await service.finish('code', attempt)).toEqual({ sub: '123', email: 'person@example.com' });
  });

  it('sends the code with the PKCE verifier to Google', async () => {
    answerWith(await idToken(good));
    await service.finish('the-code', attempt);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('code')).toBe('the-code');
    expect(body.get('code_verifier')).toBe('v');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it.each([
    ['an unverified email', { ...good, email_verified: false }, {}],
    ['a different nonce', { ...good, nonce: 'other' }, {}],
    ['another issuer', good, { iss: 'https://evil.test' }],
    ['another audience', good, { aud: 'someone-else' }],
    ['an expired token', good, { exp: '-1m' }],
  ])('rejects %s', async (_name, claims, overrides) => {
    answerWith(await idToken(claims, overrides));
    await expect(service.finish('code', attempt)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with a key Google does not publish', async () => {
    const other = await generateKeyPair('RS256');
    const forged = await new SignJWT(good)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setExpirationTime('5m')
      .sign(other.privateKey);
    answerWith(forged);
    await expect(service.finish('code', attempt)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when Google refuses the code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(service.finish('bad', attempt)).rejects.toThrow(UnauthorizedException);
  });
});

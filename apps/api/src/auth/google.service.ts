import { createHash } from 'node:crypto';
import { BadGatewayException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { randomToken } from '../guard/token';

/** Google sign in settings. With no client id the method is off. */
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Where Google sends the person back; it must match the one registered with Google. */
  redirectUri: string;
  /** Lets tests sign their own tokens. Production reads Google's published keys. */
  keys?: JWTVerifyGetKey;
}
export const GOOGLE_CONFIG = Symbol('GOOGLE_CONFIG');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const tokenResponseSchema = z.object({ id_token: z.string() });
const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.boolean(),
  nonce: z.string(),
});

/** What the browser must hand back at the callback, kept in a short lived cookie with the page to return to. */
export const googleAttemptSchema = z.object({
  state: z.string().min(1),
  verifier: z.string().min(1),
  nonce: z.string().min(1),
  next: z.string(),
});
export type GoogleAttempt = z.infer<typeof googleAttemptSchema>;

/** The part of a verified Google identity Interim uses. */
export interface GoogleIdentity {
  sub: string;
  email: string;
}

/**
 * Sign in with Google by the authorization code flow with PKCE, written against Google's endpoints.
 * Only the `openid` and `email` scopes are asked for, so no name or photo reaches Interim.
 */
@Injectable()
export class GoogleService {
  private readonly keys: JWTVerifyGetKey;

  constructor(@Inject(GOOGLE_CONFIG) private readonly config: GoogleConfig) {
    this.keys = config.keys ?? createRemoteJWKSet(new URL(KEYS_URL));
  }

  get enabled(): boolean {
    return this.config.clientId !== '';
  }

  /** Starts an attempt: the address to send the person to, and the secrets to check when they return. */
  begin(): { url: string; attempt: Omit<GoogleAttempt, 'next'> } {
    const attempt = { state: randomToken(), verifier: randomToken(), nonce: randomToken() };
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'openid email',
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return { url: `${AUTH_URL}?${params}`, attempt };
  }

  /**
   * Trades the code for an ID token and checks it: signature, issuer, audience, expiry, nonce and a verified email.
   * @throws UnauthorizedException when Google's answer cannot be trusted.
   * @throws BadGatewayException when Google cannot be reached.
   */
  async finish(code: string, attempt: Pick<GoogleAttempt, 'verifier' | 'nonce'>): Promise<GoogleIdentity> {
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: attempt.verifier,
        }),
      });
    } catch {
      throw new BadGatewayException('Google could not be reached');
    }
    if (!response.ok) throw new UnauthorizedException();
    const { id_token } = tokenResponseSchema.parse(await response.json());
    try {
      const { payload } = await jwtVerify(id_token, this.keys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: this.config.clientId,
      });
      const claims = claimsSchema.parse(payload);
      if (claims.nonce !== attempt.nonce || !claims.email_verified) throw new UnauthorizedException();
      return { sub: claims.sub, email: claims.email.trim().toLowerCase() };
    } catch (cause) {
      if (cause instanceof UnauthorizedException) throw cause;
      throw new UnauthorizedException();
    }
  }
}

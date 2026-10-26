import { type Db, account, authToken, photo, profile, rateLimit, recoveryCode, session, snapshot } from '@interim/db';
import { recoverAccountSchema, registerSchema } from '@interim/types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, SessionService } from '../guard/session.service';
import { ProfilesService } from '../profiles/profiles.service';
import { FakeMail, fakeRes, reqWith } from '../test/http-fakes';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RateLimitService } from './rate-limit.service';

const secrets = { secret: 's'.repeat(32), secureCookie: false };
const config = { webOrigin: 'https://web.test' };
const ip = '203.0.113.7';
const password = 'a long enough password';

let db: Db;
let mail: FakeMail;
let storage: MemoryStorage;
let sessions: SessionService;
let profiles: ProfilesService;
let auth: AuthService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate account, auth_token, rate_limit, profile, deletion_request cascade`);
  mail = new FakeMail();
  storage = new MemoryStorage();
  sessions = new SessionService(db, secrets);
  profiles = new ProfilesService(db, storage.asService());
  auth = new AuthService(
    db,
    config,
    secrets,
    new PasswordService(),
    sessions,
    mail.asService(),
    new RateLimitService(db, secrets),
    profiles,
  );
});

const register = (email = 'a@b.co') => auth.register({ email, password, locale: 'en' }, ip);
const find = async (email = 'a@b.co') => (await db.select().from(account).where(eq(account.email, email)))[0];

/** Registers, follows the emailed link and returns the browser's session cookie. */
async function signedUp(email = 'a@b.co') {
  await register(email);
  const { res, cookies } = fakeRes();
  await auth.confirmEmail({ token: mail.lastToken() }, ip, res);
  return { session: cookies.get(SESSION_COOKIE) ?? '' };
}

describe('register and confirm', () => {
  it('creates an unconfirmed account and emails a link, storing no raw token', async () => {
    await auth.register(registerSchema.parse({ email: ' A@B.co ', password, locale: 'en' }), ip);
    const created = await find();
    expect(created).toMatchObject({ email: 'a@b.co', emailVerifiedAt: null });
    expect(created?.passwordHash).toMatch(/^scrypt\$/);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.text).toContain('https://web.test/auth/confirm?kind=verify&token=');
    const [token] = await db.select().from(authToken);
    expect(token?.tokenHash).not.toContain(mail.lastToken());
  });

  it('does not let an unconfirmed account sign in, then does once the link is used', async () => {
    await register();
    await expect(auth.login({ email: 'a@b.co', password }, ip, fakeRes().res)).rejects.toThrow(ForbiddenException);

    const { res, cookies } = fakeRes();
    await auth.confirmEmail({ token: mail.lastToken() }, ip, res);
    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect((await find())?.emailVerifiedAt).not.toBeNull();
    await expect(auth.login({ email: 'a@b.co', password }, ip, fakeRes().res)).resolves.toMatchObject({ email: 'a@b.co' });
  });

  it('looks the same for an address that already has an account, and tells that person instead', async () => {
    await signedUp();
    const before = await find();
    mail.sent.length = 0;
    await auth.register({ email: 'a@b.co', password: 'someone elses password', locale: 'en' }, ip);
    expect((await find())?.passwordHash).toBe(before?.passwordHash);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.text).toContain('https://web.test/signin');
    expect(mail.sent[0]?.text).not.toContain('token=');
  });

  it('lets a second registration replace the password of an account that never confirmed', async () => {
    await register();
    const first = await find();
    await auth.register({ email: 'a@b.co', password: 'another long password', locale: 'en' }, ip);
    expect((await find())?.passwordHash).not.toBe(first?.passwordHash);
  });

  it('writes the email in the language asked for', async () => {
    await auth.register({ email: 'a@b.co', password, locale: 'fr' }, ip);
    expect(mail.sent[0]?.subject).toBe('Confirmez votre e-mail pour Interim');
  });

  it('accepts a link once only, and not after it expires', async () => {
    await register();
    const token = mail.lastToken();
    await auth.confirmEmail({ token }, ip, fakeRes().res);
    await expect(auth.confirmEmail({ token }, ip, fakeRes().res)).rejects.toThrow(BadRequestException);

    await auth.register({ email: 'c@d.co', password, locale: 'en' }, ip);
    await db.update(authToken).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authToken.email, 'c@d.co'));
    await expect(auth.confirmEmail({ token: mail.lastToken() }, ip, fakeRes().res)).rejects.toThrow(BadRequestException);
  });

  it('does not accept a link meant for something else', async () => {
    await register();
    await expect(auth.useMagicLink({ token: mail.lastToken() }, ip, fakeRes().res)).rejects.toThrow(BadRequestException);
  });
});

describe('login', () => {
  it('does not tell a wrong password from an unknown email', async () => {
    await signedUp();
    const wrong = auth.login({ email: 'a@b.co', password: 'wrong password!!' }, ip, fakeRes().res);
    const unknown = auth.login({ email: 'nobody@b.co', password }, ip, fakeRes().res);
    await expect(wrong).rejects.toThrow(UnauthorizedException);
    await expect(unknown).rejects.toThrow(UnauthorizedException);
  });

  it('sets a session cookie and answers with the account', async () => {
    await signedUp();
    const { res, cookies } = fakeRes();
    const me = await auth.login({ email: 'a@b.co', password }, ip, res);
    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect(me).toEqual({ email: 'a@b.co', hasPassword: true, recoveryCodes: 0 });
  });

  it('slows down repeated wrong passwords for one email with a 429', async () => {
    await signedUp();
    const tries = Array.from({ length: 9 }, () => auth.login({ email: 'a@b.co', password: 'wrong password!!' }, ip, fakeRes().res));
    const results = await Promise.allSettled(tries);
    const limited = results.filter((r) => r.status === 'rejected' && r.reason instanceof HttpException && r.reason.getStatus() === 429);
    expect(limited).toHaveLength(1);
  });
});

describe('sign-in links', () => {
  it('creates the account on first use, already confirmed, and signs in', async () => {
    await auth.requestMagicLink({ email: 'new@b.co', locale: 'en' }, ip);
    expect(await find('new@b.co')).toBeUndefined();
    const { res, cookies } = fakeRes();
    await auth.useMagicLink({ token: mail.lastToken() }, ip, res);
    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect(await find('new@b.co')).toMatchObject({ passwordHash: null });
    expect((await find('new@b.co'))?.emailVerifiedAt).not.toBeNull();
  });

  it('a newer link replaces an older one', async () => {
    await auth.requestMagicLink({ email: 'a@b.co', locale: 'en' }, ip);
    const old = mail.lastToken();
    await auth.requestMagicLink({ email: 'a@b.co', locale: 'en' }, ip);
    await expect(auth.useMagicLink({ token: old }, ip, fakeRes().res)).rejects.toThrow(BadRequestException);
    await expect(auth.useMagicLink({ token: mail.lastToken() }, ip, fakeRes().res)).resolves.toBeDefined();
  });

  it('discards the password of an unconfirmed account when the real owner proves the inbox', async () => {
    await register('victim@b.co'); // someone else typed the victim’s address
    await auth.requestMagicLink({ email: 'victim@b.co', locale: 'en' }, ip);
    await auth.useMagicLink({ token: mail.lastToken() }, ip, fakeRes().res);

    const taken = await find('victim@b.co');
    expect(taken?.passwordHash).toBeNull();
    await expect(auth.login({ email: 'victim@b.co', password }, ip, fakeRes().res)).rejects.toThrow(UnauthorizedException);
  });
});

describe('password reset', () => {
  it('sends nothing for an unknown address, and does not say so', async () => {
    await expect(auth.requestPasswordReset({ email: 'nobody@b.co', locale: 'en' }, ip)).resolves.toBeUndefined();
    expect(mail.sent).toHaveLength(0);
  });

  it('sets a new password, signs every other browser out and signs this one in', async () => {
    const { session: oldSession } = await signedUp();
    await auth.requestPasswordReset({ email: 'a@b.co', locale: 'en' }, ip);
    const { res, cookies } = fakeRes();
    await auth.resetPassword({ token: mail.lastToken(), password: 'a brand new password' }, ip, res);

    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: oldSession }))).toBeUndefined();
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: cookies.get(SESSION_COOKIE) ?? '' }))).toBeDefined();
    await expect(auth.login({ email: 'a@b.co', password }, ip, fakeRes().res)).rejects.toThrow(UnauthorizedException);
    await expect(auth.login({ email: 'a@b.co', password: 'a brand new password' }, ip, fakeRes().res)).resolves.toBeDefined();
  });

  it('lets a link or Google account choose a password, and works only once', async () => {
    await auth.requestMagicLink({ email: 'a@b.co', locale: 'en' }, ip);
    await auth.useMagicLink({ token: mail.lastToken() }, ip, fakeRes().res);
    await auth.requestPasswordReset({ email: 'a@b.co', locale: 'en' }, ip);
    const token = mail.lastToken();
    await auth.resetPassword({ token, password }, ip, fakeRes().res);
    expect((await find())?.passwordHash).toMatch(/^scrypt\$/);
    await expect(auth.resetPassword({ token, password }, ip, fakeRes().res)).rejects.toThrow(BadRequestException);
  });
});

describe('Google', () => {
  const identity = { sub: 'g-1', email: 'g@b.co' };

  it('creates a confirmed account, and signs the same person in again by Google id', async () => {
    const first = fakeRes();
    await auth.signInWithGoogle(identity, first.res);
    expect(first.cookies.has(SESSION_COOKIE)).toBe(true);
    expect(await find('g@b.co')).toMatchObject({ googleSub: 'g-1', passwordHash: null });

    const again = fakeRes();
    await auth.signInWithGoogle({ sub: 'g-1', email: 'changed@b.co' }, again.res);
    expect(again.cookies.has(SESSION_COOKIE)).toBe(true);
    expect(await db.select().from(account)).toHaveLength(1);
  });

  it('links to a confirmed account with the same email and keeps its password', async () => {
    await signedUp('g@b.co');
    await auth.signInWithGoogle(identity, fakeRes().res);
    expect(await find('g@b.co')).toMatchObject({ googleSub: 'g-1' });
    await expect(auth.login({ email: 'g@b.co', password }, ip, fakeRes().res)).resolves.toBeDefined();
  });

  it('discards the password of an unconfirmed account with the same email', async () => {
    await register('g@b.co');
    await auth.signInWithGoogle(identity, fakeRes().res);
    expect(await find('g@b.co')).toMatchObject({ googleSub: 'g-1', passwordHash: null });
    expect((await find('g@b.co'))?.emailVerifiedAt).not.toBeNull();
  });

  it('refuses an email that is already tied to a different Google account', async () => {
    await auth.signInWithGoogle(identity, fakeRes().res);
    await expect(auth.signInWithGoogle({ sub: 'g-2', email: 'g@b.co' }, fakeRes().res)).rejects.toThrow(ConflictException);
  });
});

describe('delete account', () => {
  async function withProfile() {
    const { session: token } = await signedUp();
    const signedIn = (await sessions.resolve(reqWith({ [SESSION_COOKIE]: token }))) ?? { accountId: '', email: '' };
    const owner = { ref: `account:${signedIn.accountId}` };
    const made = await profiles.create(owner, { templateKey: 'going_grey', ageConfirmed: true });
    const [snap] = await db.insert(snapshot).values({ profileId: made.id }).returning();
    await db.insert(photo).values({ snapshotId: snap?.id ?? '', kind: 'front', objectKey: `photos/${made.id}/s/front.jpg`, sha256: 'x', expiresAt: new Date(Date.now() + 1e9) });
    await storage.put(`photos/${made.id}/s/front.jpg`, Buffer.from('x'));
    return { signedIn, profileId: made.id };
  }

  it('needs the right password for an account that has one', async () => {
    const { signedIn } = await withProfile();
    await expect(auth.deleteAccount(signedIn, {}, ip, fakeRes().res)).rejects.toThrow(ForbiddenException);
    await expect(auth.deleteAccount(signedIn, { password: 'wrong password!!' }, ip, fakeRes().res)).rejects.toThrow(ForbiddenException);
    expect(await find()).toBeDefined();
  });

  it('removes the account, its sessions, its profiles and their files', async () => {
    const { signedIn, profileId } = await withProfile();
    const { res, spies } = fakeRes();
    await auth.deleteAccount(signedIn, { password }, ip, res);

    expect(await find()).toBeUndefined();
    expect(await db.select().from(session)).toEqual([]);
    expect(await db.select().from(profile).where(eq(profile.id, profileId))).toEqual([]);
    expect([...storage.objects.keys()]).toEqual([]);
    expect(await db.select().from(authToken)).toEqual([]);
    expect(spies.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
  });

  it('lets an account without a password delete itself', async () => {
    await auth.signInWithGoogle({ sub: 'g-9', email: 'g@b.co' }, fakeRes().res);
    const created = await find('g@b.co');
    await auth.deleteAccount({ accountId: created?.id ?? '', email: 'g@b.co' }, {}, ip, fakeRes().res);
    expect(await find('g@b.co')).toBeUndefined();
  });
});

describe('RateLimitService', () => {
  it('counts per window and stores no email or address', async () => {
    const limits = new RateLimitService(db, secrets);
    await limits.hit('x', 'person@b.co', 2, 60_000);
    await limits.hit('x', 'person@b.co', 2, 60_000);
    await expect(limits.hit('x', 'person@b.co', 2, 60_000)).rejects.toThrow(HttpException);
    await limits.hit('x', 'other@b.co', 2, 60_000);
    const rows = await db.select().from(rateLimit);
    expect(rows.map((r) => r.hits).sort()).toEqual([1, 3]);
    expect(JSON.stringify(rows)).not.toContain('person@b.co');
  });
});

describe('profile ownership', () => {
  it('keeps one account’s profiles from another’s', async () => {
    const first = await signedUp('a@b.co');
    const second = await signedUp('c@d.co');
    const ownerOf = async (token: string) => {
      const signedIn = (await sessions.resolve(reqWith({ [SESSION_COOKIE]: token }))) ?? { accountId: '', email: '' };
      return { ref: `account:${signedIn.accountId}` };
    };
    const mine = await profiles.create(await ownerOf(first.session), { templateKey: 'going_grey', ageConfirmed: true });
    expect(await profiles.list(await ownerOf(second.session))).toEqual([]);
    await expect(profiles.get(mine.id, await ownerOf(second.session))).rejects.toThrow();
    expect((await profiles.get(mine.id, await ownerOf(first.session))).id).toBe(mine.id);
  });
});

const meOf = async (email = 'a@b.co') => {
  const found = await find(email);
  return { accountId: found?.id ?? '', email };
};

describe('change email', () => {
  // `null` means no password is sent, which a default value could not say.
  const change = (email: string, given: string | null = password) =>
    meOf().then((me) => auth.requestEmailChange(me, { email, locale: 'en', password: given ?? undefined }, ip));

  it('emails the new address and changes nothing until its link is used', async () => {
    await signedUp();
    await change('new@b.co');
    expect(mail.sent.at(-1)?.to).toBe('new@b.co');
    expect(mail.sent.at(-1)?.text).toContain('https://web.test/auth/confirm?kind=change&token=');
    expect((await find())?.email).toBe('a@b.co');
  });

  it('moves the account on the link, signs in, signs others out and tells the old address', async () => {
    const { session: old } = await signedUp();
    await change('new@b.co');
    const { res, cookies } = fakeRes();
    await expect(auth.confirmEmailChange({ token: mail.lastToken(), locale: 'en' }, ip, res)).resolves.toMatchObject({
      email: 'new@b.co',
    });
    expect(await find('a@b.co')).toBeUndefined();
    expect(await find('new@b.co')).toMatchObject({ emailVerifiedAt: expect.any(Date) });
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: old }))).toBeUndefined();
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: cookies.get(SESSION_COOKIE) ?? '' }))).toMatchObject({
      email: 'new@b.co',
    });
    expect(mail.sent.at(-1)).toMatchObject({ to: 'a@b.co' });
    expect(mail.sent.at(-1)?.text).not.toContain('http');
    await expect(auth.login({ email: 'new@b.co', password }, ip, fakeRes().res)).resolves.toBeDefined();
  });

  it('needs the password of an account that has one', async () => {
    await signedUp();
    await expect(change('new@b.co', null)).rejects.toThrow(ForbiddenException);
    await expect(change('new@b.co', 'not the password')).rejects.toThrow(ForbiddenException);
    expect(mail.sent).toHaveLength(1);
  });

  it('lets an account without a password change address on its session alone', async () => {
    await auth.requestMagicLink({ email: 'a@b.co', locale: 'en' }, ip);
    await auth.useMagicLink({ token: mail.lastToken() }, ip, fakeRes().res);
    await change('new@b.co', null);
    expect(mail.sent.at(-1)?.to).toBe('new@b.co');
  });

  it('does not say an address is taken: it emails that person instead', async () => {
    await signedUp();
    await signedUp('other@b.co');
    const before = mail.sent.length;
    await change('other@b.co');
    expect(mail.sent).toHaveLength(before + 1);
    expect(mail.sent.at(-1)?.to).toBe('other@b.co');
    expect(mail.sent.at(-1)?.text).toContain('https://web.test/signin');
    expect(await db.select().from(authToken).where(eq(authToken.purpose, 'change_email'))).toHaveLength(0);
  });

  it('refuses a link whose address was taken in the meantime', async () => {
    await signedUp();
    await change('new@b.co');
    const token = mail.lastToken();
    await signedUp('new@b.co');
    await expect(auth.confirmEmailChange({ token, locale: 'en' }, ip, fakeRes().res)).rejects.toThrow(ConflictException);
    expect((await find())?.email).toBe('a@b.co');
  });

  it('accepts a link once only, and not one meant for something else', async () => {
    await signedUp();
    await change('new@b.co');
    const token = mail.lastToken();
    await expect(auth.useMagicLink({ token }, ip, fakeRes().res)).rejects.toThrow(BadRequestException);
    await auth.confirmEmailChange({ token, locale: 'en' }, ip, fakeRes().res);
    await expect(auth.confirmEmailChange({ token, locale: 'en' }, ip, fakeRes().res)).rejects.toThrow(BadRequestException);
  });

  it('kills links still out for the old address', async () => {
    await signedUp();
    await auth.requestMagicLink({ email: 'a@b.co', locale: 'en' }, ip);
    const stale = mail.lastToken();
    await change('new@b.co');
    await auth.confirmEmailChange({ token: mail.lastToken(), locale: 'en' }, ip, fakeRes().res);
    await expect(auth.useMagicLink({ token: stale }, ip, fakeRes().res)).rejects.toThrow(BadRequestException);
  });
});

describe('recovery codes and recovering an account', () => {
  // Through the schema, as the controller does, so a code typed with dashes and lower case is normalised first.
  const recover = (input: { email: string; code: string; newEmail: string; locale: 'en' }) =>
    auth.requestRecovery(recoverAccountSchema.parse(input), ip);

  const makeCodes = async (given: string | null = password) =>
    (await auth.createRecoveryCodes(await meOf(), { password: given ?? undefined }, ip)).codes;

  it('shows eight codes once, stores only hashes and counts the unused', async () => {
    await signedUp();
    const codes = await makeCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
    const stored = await db.select().from(recoveryCode);
    expect(stored).toHaveLength(8);
    for (const row of stored) expect(codes.join('')).not.toContain(row.codeHash);
    expect(await auth.me(await meOf())).toMatchObject({ recoveryCodes: 8 });
  });

  it('needs the password, and a new set replaces the old one', async () => {
    await signedUp();
    await expect(makeCodes(null)).rejects.toThrow(ForbiddenException);
    const first = await makeCodes();
    await makeCodes();
    await recover({ email: 'a@b.co', code: first[0] ?? '', newEmail: 'new@b.co', locale: 'en' });
    expect(mail.sent.at(-1)?.to).not.toBe('new@b.co');
    expect(await auth.me(await meOf())).toMatchObject({ recoveryCodes: 8 });
  });

  it('with a code and a new address, emails that address and moves the account when the link is used', async () => {
    const { session: old } = await signedUp();
    const [code] = await makeCodes();
    await recover({ email: 'a@b.co', code: code ?? '', newEmail: 'new@b.co', locale: 'en' });
    expect(mail.sent.at(-1)?.to).toBe('new@b.co');
    expect(mail.sent.at(-1)?.text).toContain('https://web.test/auth/confirm?kind=recover&token=');
    expect((await find())?.email).toBe('a@b.co');

    const { res, cookies } = fakeRes();
    await expect(auth.confirmRecovery({ token: mail.lastToken(), locale: 'en' }, ip, res)).resolves.toMatchObject({
      email: 'new@b.co',
      recoveryCodes: 7,
    });
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: old }))).toBeUndefined();
    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect(mail.sent.at(-1)?.to).toBe('a@b.co');
  });

  it('spends a code once', async () => {
    await signedUp();
    const [code] = await makeCodes();
    const ask = (newEmail: string) =>
      recover({ email: 'a@b.co', code: code ?? '', newEmail, locale: 'en' });
    await ask('new@b.co');
    const sent = mail.sent.length;
    await ask('again@b.co');
    expect(mail.sent).toHaveLength(sent);
  });

  it('answers the same, and sends nothing, for a wrong code, an unknown address or a taken new address', async () => {
    await signedUp();
    await signedUp('other@b.co');
    const [code] = await makeCodes();
    const sent = mail.sent.length;
    await expect(
      recover({ email: 'a@b.co', code: 'aaaa-aaaa-aaaa-aaaa', newEmail: 'new@b.co', locale: 'en' }),
    ).resolves.toBeUndefined();
    await expect(
      recover({ email: 'nobody@b.co', code: code ?? '', newEmail: 'new@b.co', locale: 'en' }),
    ).resolves.toBeUndefined();
    await expect(
      recover({ email: 'a@b.co', code: code ?? '', newEmail: 'other@b.co', locale: 'en' }),
    ).resolves.toBeUndefined();
    expect(mail.sent).toHaveLength(sent);
    expect(await auth.me(await meOf())).toMatchObject({ recoveryCodes: 8 });
  });

  it('does not take a code of another account', async () => {
    await signedUp();
    await signedUp('other@b.co');
    const [code] = (await auth.createRecoveryCodes(await meOf('other@b.co'), { password }, ip)).codes;
    const sent = mail.sent.length;
    await recover({ email: 'a@b.co', code: code ?? '', newEmail: 'new@b.co', locale: 'en' });
    expect(mail.sent).toHaveLength(sent);
  });

  it('limits guesses per address with a 429', async () => {
    await signedUp();
    const guess = () => recover({ email: 'a@b.co', code: 'AAAAAAAAAAAAAAAA', newEmail: 'new@b.co', locale: 'en' });
    for (let i = 0; i < 5; i++) await guess();
    await expect(guess()).rejects.toThrow(HttpException);
  });

  it('deletes with the account', async () => {
    await signedUp();
    await makeCodes();
    await auth.deleteAccount(await meOf(), { password }, ip, fakeRes().res);
    expect(await db.select().from(recoveryCode)).toHaveLength(0);
  });
});

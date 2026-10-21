import { type Db, account, authToken, photo, profile, rateLimit, session, snapshot } from '@interim/db';
import { registerSchema } from '@interim/types';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OWNER_COOKIE, OwnerService } from '../guard/owner.service';
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
let owners: OwnerService;
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
  owners = new OwnerService(secrets, sessions);
  profiles = new ProfilesService(db, storage.asService());
  auth = new AuthService(
    db,
    config,
    secrets,
    new PasswordService(),
    sessions,
    owners,
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
  await auth.confirmEmail({ token: mail.lastToken() }, ip, reqWith(), res);
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
    await expect(auth.login({ email: 'a@b.co', password }, ip, reqWith(), fakeRes().res)).rejects.toThrow(ForbiddenException);

    const { res, cookies } = fakeRes();
    await auth.confirmEmail({ token: mail.lastToken() }, ip, reqWith(), res);
    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect((await find())?.emailVerifiedAt).not.toBeNull();
    await expect(auth.login({ email: 'a@b.co', password }, ip, reqWith(), fakeRes().res)).resolves.toMatchObject({ email: 'a@b.co' });
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
    await auth.confirmEmail({ token }, ip, reqWith(), fakeRes().res);
    await expect(auth.confirmEmail({ token }, ip, reqWith(), fakeRes().res)).rejects.toThrow(BadRequestException);

    await auth.register({ email: 'c@d.co', password, locale: 'en' }, ip);
    await db.update(authToken).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authToken.email, 'c@d.co'));
    await expect(auth.confirmEmail({ token: mail.lastToken() }, ip, reqWith(), fakeRes().res)).rejects.toThrow(BadRequestException);
  });

  it('does not accept a link meant for something else', async () => {
    await register();
    await expect(auth.useMagicLink({ token: mail.lastToken() }, ip, reqWith(), fakeRes().res)).rejects.toThrow(BadRequestException);
  });
});

describe('login', () => {
  it('does not tell a wrong password from an unknown email', async () => {
    await signedUp();
    const wrong = auth.login({ email: 'a@b.co', password: 'wrong password!!' }, ip, reqWith(), fakeRes().res);
    const unknown = auth.login({ email: 'nobody@b.co', password }, ip, reqWith(), fakeRes().res);
    await expect(wrong).rejects.toThrow(UnauthorizedException);
    await expect(unknown).rejects.toThrow(UnauthorizedException);
  });

  it('sets a session cookie and counts profiles waiting on this device', async () => {
    await signedUp();
    const device = owners.resolveDevice(reqWith({ [OWNER_COOKIE]: 'device-token' }));
    await profiles.create(device ?? { ref: '' }, { templateKey: 'going_grey', ageConfirmed: true });
    const { res, cookies } = fakeRes();
    const me = await auth.login({ email: 'a@b.co', password }, ip, reqWith({ [OWNER_COOKIE]: 'device-token' }), res);
    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect(me).toEqual({ email: 'a@b.co', hasPassword: true, claimable: 1 });
  });

  it('slows down repeated wrong passwords for one email with a 429', async () => {
    await signedUp();
    const tries = Array.from({ length: 9 }, () => auth.login({ email: 'a@b.co', password: 'wrong password!!' }, ip, reqWith(), fakeRes().res));
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
    await auth.useMagicLink({ token: mail.lastToken() }, ip, reqWith(), res);
    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect(await find('new@b.co')).toMatchObject({ passwordHash: null });
    expect((await find('new@b.co'))?.emailVerifiedAt).not.toBeNull();
  });

  it('a newer link replaces an older one', async () => {
    await auth.requestMagicLink({ email: 'a@b.co', locale: 'en' }, ip);
    const old = mail.lastToken();
    await auth.requestMagicLink({ email: 'a@b.co', locale: 'en' }, ip);
    await expect(auth.useMagicLink({ token: old }, ip, reqWith(), fakeRes().res)).rejects.toThrow(BadRequestException);
    await expect(auth.useMagicLink({ token: mail.lastToken() }, ip, reqWith(), fakeRes().res)).resolves.toBeDefined();
  });

  it('discards the password of an unconfirmed account when the real owner proves the inbox', async () => {
    await register('victim@b.co'); // someone else typed the victim’s address
    await auth.requestMagicLink({ email: 'victim@b.co', locale: 'en' }, ip);
    await auth.useMagicLink({ token: mail.lastToken() }, ip, reqWith(), fakeRes().res);

    const taken = await find('victim@b.co');
    expect(taken?.passwordHash).toBeNull();
    await expect(auth.login({ email: 'victim@b.co', password }, ip, reqWith(), fakeRes().res)).rejects.toThrow(UnauthorizedException);
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
    await auth.resetPassword({ token: mail.lastToken(), password: 'a brand new password' }, ip, reqWith(), res);

    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: oldSession }))).toBeUndefined();
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: cookies.get(SESSION_COOKIE) ?? '' }))).toBeDefined();
    await expect(auth.login({ email: 'a@b.co', password }, ip, reqWith(), fakeRes().res)).rejects.toThrow(UnauthorizedException);
    await expect(auth.login({ email: 'a@b.co', password: 'a brand new password' }, ip, reqWith(), fakeRes().res)).resolves.toBeDefined();
  });

  it('lets a link or Google account choose a password, and works only once', async () => {
    await auth.requestMagicLink({ email: 'a@b.co', locale: 'en' }, ip);
    await auth.useMagicLink({ token: mail.lastToken() }, ip, reqWith(), fakeRes().res);
    await auth.requestPasswordReset({ email: 'a@b.co', locale: 'en' }, ip);
    const token = mail.lastToken();
    await auth.resetPassword({ token, password }, ip, reqWith(), fakeRes().res);
    expect((await find())?.passwordHash).toMatch(/^scrypt\$/);
    await expect(auth.resetPassword({ token, password }, ip, reqWith(), fakeRes().res)).rejects.toThrow(BadRequestException);
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
    await expect(auth.login({ email: 'g@b.co', password }, ip, reqWith(), fakeRes().res)).resolves.toBeDefined();
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

describe('claiming device profiles', () => {
  const deviceCookie = { [OWNER_COOKIE]: 'device-token' };
  const device = () => owners.resolveDevice(reqWith(deviceCookie)) ?? { ref: '' };

  it('moves this device’s profiles into the account and leaves other devices’ alone', async () => {
    const { session: token } = await signedUp();
    const mine = await profiles.create(device(), { templateKey: 'going_grey', ageConfirmed: true });
    const theirs = await profiles.create({ ref: 'someone-else' }, { templateKey: 'going_grey', ageConfirmed: true });
    const signedIn = (await sessions.resolve(reqWith({ [SESSION_COOKIE]: token }))) ?? { accountId: '', email: '' };

    expect(await auth.claim(signedIn, reqWith(deviceCookie))).toBe(1);
    const owner = await owners.resolve(reqWith({ [SESSION_COOKIE]: token }));
    expect((await profiles.list(owner ?? { ref: '' })).map((p) => p.id)).toEqual([mine.id]);
    await expect(profiles.get(mine.id, device())).rejects.toThrow();
    expect((await profiles.get(theirs.id, { ref: 'someone-else' })).id).toBe(theirs.id);
    expect(await auth.claim(signedIn, reqWith(deviceCookie))).toBe(0);
  });

  it('claims nothing without a device cookie', async () => {
    const { session: token } = await signedUp();
    const signedIn = (await sessions.resolve(reqWith({ [SESSION_COOKIE]: token }))) ?? { accountId: '', email: '' };
    expect(await auth.claim(signedIn, reqWith())).toBe(0);
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

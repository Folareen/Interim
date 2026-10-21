import { type Db, account, session } from '@interim/db';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/test-db';
import { fakeRes, reqWith } from '../test/http-fakes';
import { SESSION_COOKIE, SessionService } from './session.service';

const config = { secret: 's'.repeat(32), secureCookie: true };
const DAY_MS = 24 * 60 * 60 * 1000;

let db: Db;
let sessions: SessionService;
let accountId: string;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate account cascade`);
  sessions = new SessionService(db, config);
  const [row] = await db.insert(account).values({ email: 'a@b.co', emailVerifiedAt: new Date() }).returning();
  accountId = row?.id ?? '';
});

async function signIn() {
  const { res, cookies, spies } = fakeRes();
  await sessions.start(res, accountId);
  return { token: cookies.get(SESSION_COOKIE) ?? '', spies };
}

describe('SessionService', () => {
  it('starts a session with an httpOnly cookie and stores only a hash of its token', async () => {
    const { token, spies } = await signIn();
    expect(spies.cookie.mock.calls[0]?.[2]).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
    const [row] = await db.select().from(session);
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.tokenHash).not.toContain(token);
  });

  it('resolves the account from the cookie', async () => {
    const { token } = await signIn();
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: token }))).toEqual({ accountId, email: 'a@b.co' });
  });

  it('knows nobody without a cookie or with a made up one', async () => {
    expect(await sessions.resolve(reqWith())).toBeUndefined();
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: 'made-up' }))).toBeUndefined();
  });

  it('stops resolving once the session has expired', async () => {
    const { token } = await signIn();
    await db.update(session).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: token }))).toBeUndefined();
  });

  it('extends a session in use once it is past half way, and sets the cookie again', async () => {
    const { token } = await signIn();
    await db.update(session).set({ expiresAt: new Date(Date.now() + 5 * DAY_MS) });
    const { res, spies } = fakeRes();
    await sessions.resolve(reqWith({ [SESSION_COOKIE]: token }), res);
    const [row] = await db.select().from(session);
    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * DAY_MS);
    expect(spies.cookie).toHaveBeenCalledOnce();
  });

  it('leaves a fresh session alone', async () => {
    const { token } = await signIn();
    const { res, spies } = fakeRes();
    await sessions.resolve(reqWith({ [SESSION_COOKIE]: token }), res);
    expect(spies.cookie).not.toHaveBeenCalled();
  });

  it('ends one session, or all of an account’s', async () => {
    const first = await signIn();
    const second = await signIn();
    const { res } = fakeRes();
    await sessions.end(reqWith({ [SESSION_COOKIE]: first.token }), res);
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: first.token }))).toBeUndefined();
    expect(await sessions.resolve(reqWith({ [SESSION_COOKIE]: second.token }))).toBeDefined();
    await sessions.endAll(accountId);
    expect(await db.select().from(session).where(eq(session.accountId, accountId))).toEqual([]);
  });

  it('is removed with the account', async () => {
    await signIn();
    await db.delete(account).where(eq(account.id, accountId));
    expect(await db.select().from(session)).toEqual([]);
  });
});

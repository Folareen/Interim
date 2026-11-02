import type { Db } from '@interim/db';
import { profile, run, snapshot } from '@interim/db';
import { sql } from 'drizzle-orm';
import type IORedis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentService } from '../agent/agent.service';
import type { StyleRenderService } from '../style/style-render.service';
import { connectTestRedis } from '../test/redis';
import { createTestDb } from '../test/test-db';
import { ProfileLock } from './profile-lock';
import { RunWorker } from './run.worker';

let redis: IORedis | undefined;
const url = process.env.REDIS_TEST_URL ?? 'redis://localhost:6379';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const profileId = '3f2b8a0e-7c2d-4a39-9d57-0d7a6a1f2b11';
const otherProfile = '5c1d9e2f-8a3b-4c4d-9e5f-1a2b3c4d5e6f';

beforeAll(async () => {
  redis = await connectTestRedis();
});
afterAll(() => redis?.disconnect());
const skipWithoutRedis = (ctx: { skip: () => void }) => {
  if (!redis) ctx.skip();
};

describe('ProfileLock', () => {
  beforeEach(skipWithoutRedis);
  const locks: ProfileLock[] = [];
  const lock = (ttl = 60_000) => {
    const made = new ProfileLock(url, ttl);
    locks.push(made);
    return made;
  };
  afterAll(() => locks.forEach((l) => l.onApplicationShutdown()));
  const id = () => crypto.randomUUID();

  it('keeps a second worker off a profile that is being run, and lets it in afterwards', async () => {
    const one = lock();
    const two = lock();
    const profile = id();
    let release!: () => void;
    const running = one.run(profile, () => new Promise<void>((resolve) => (release = resolve)));
    await wait(50);

    expect(await two.run(profile, () => Promise.resolve('ran'))).toEqual({ kind: 'busy' });
    release();
    await running;

    expect(await two.run(profile, () => Promise.resolve('ran'))).toEqual({ kind: 'done', value: 'ran' });
  });

  it('does not hold one profile’s run against another profile', async () => {
    const one = lock();
    const two = lock();
    let release!: () => void;
    const running = one.run(id(), () => new Promise<void>((resolve) => (release = resolve)));
    await wait(50);

    expect(await two.run(id(), () => Promise.resolve(1))).toEqual({ kind: 'done', value: 1 });
    release();
    await running;
  });

  it('frees the profile when the run throws', async () => {
    const profile = id();
    await expect(lock().run(profile, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    expect(await lock().run(profile, () => Promise.resolve(1))).toEqual({ kind: 'done', value: 1 });
  });

  it('frees the profile after a killed holder’s lock runs out, and not before', async () => {
    const profile = id();
    await redis?.set(`profile-lock:${profile}`, 'killed-worker', 'PX', 300);
    const next = lock(300);

    expect(await next.run(profile, () => Promise.resolve(1))).toEqual({ kind: 'busy' });
    await wait(400);

    expect(await next.run(profile, () => Promise.resolve(1))).toEqual({ kind: 'done', value: 1 });
  });

  it('keeps a long run’s lock alive past its expiry time', async () => {
    const profile = id();
    const holder = lock(300);
    const running = holder.run(profile, () => wait(900));
    await wait(650);

    expect(await lock(300).run(profile, () => Promise.resolve(1))).toEqual({ kind: 'busy' });
    await running;
  });
});

describe('RunWorker', () => {
  let db: Db;
  const runs = { a: crypto.randomUUID(), b: crypto.randomUUID(), c: crypto.randomUUID() };

  beforeAll(async () => {
    db = await createTestDb();
  });

  beforeEach(async (ctx) => {
    skipWithoutRedis(ctx);
    await db.execute(sql`truncate profile cascade`);
    for (const [pid, key] of [[profileId, 'a'], [profileId, 'b'], [otherProfile, 'c']] as const) {
      await db.insert(profile).values({ id: pid, templateKey: 'going_grey', ownerRef: 'o', consentVersion: '1' }).onConflictDoNothing();
      const [snap] = await db.insert(snapshot).values({ profileId: pid }).returning({ id: snapshot.id });
      await db.insert(run).values({ id: runs[key], snapshotId: snap?.id ?? '', templateKey: 'going_grey', templateVersion: 1, budgetUnits: 50 });
    }
  });

  it('runs two runs of one profile one after the other, and different profiles together', async () => {
    const running = new Set<string>();
    let overlapOnProfile = false;
    const agent = {
      run: vi.fn(async (runId: string) => {
        if (running.has(runs.a) && runId === runs.b) overlapOnProfile = true;
        running.add(runId);
        await wait(200);
        running.delete(runId);
      }),
    };
    const lock = new ProfileLock(url);
    const style = { render: vi.fn() };
    const worker = new RunWorker(agent as unknown as AgentService, style as unknown as StyleRenderService, url, db, lock);

    const [a, b, c] = await Promise.all([worker.process(runs.a), worker.process(runs.b), worker.process(runs.c)]);

    expect([a, b, c]).toEqual(['done', 'busy', 'done']);
    expect(overlapOnProfile).toBe(false);
    expect(agent.run).toHaveBeenCalledTimes(2);
    expect(await worker.process(runs.b)).toBe('done');
    lock.onApplicationShutdown();
  });
});

import IORedis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestRedis, uniqueKey } from '../test/redis';
import { bucket, rateLimit } from './youcam.constants';
import { YoucamRedis } from './youcam.redis';

let redis: IORedis | undefined;
beforeAll(async () => {
  redis = await connectTestRedis();
});
afterAll(() => redis?.disconnect());

const keys = () => ({ bucket: uniqueKey('bucket'), liveOff: uniqueKey('live-off') });
const timed = async (action: () => Promise<void>) => {
  const started = Date.now();
  await action();
  return Date.now() - started;
};

describe('the shared bucket', () => {
  it('stays inside YouCam’s limit in any window', () => {
    const slots = bucket.burst + Math.floor((rateLimit.windowSeconds * 1000) / bucket.intervalMs);
    expect(slots).toBeLessThanOrEqual(rateLimit.requests);
  });

  it('lets a burst through at once, then spaces requests by the interval', async (ctx) => {
    if (!redis) return ctx.skip();
    const limiter = new YoucamRedis(redis as IORedis, keys());

    const burst = await timed(async () => {
      for (let i = 0; i < bucket.burst; i++) await limiter.acquire();
    });
    const next = await timed(() => limiter.acquire());

    expect(burst).toBeLessThan(bucket.intervalMs / 2);
    expect(next).toBeGreaterThanOrEqual(bucket.intervalMs / 2);
  });

  it('is shared: a second connection finds the first one’s requests already counted', async (ctx) => {
    if (!redis) return ctx.skip();
    const shared = keys();
    const other = new IORedis(redis?.options ?? {}); // another worker, with its own connection
    const first = new YoucamRedis(redis as IORedis, shared);
    const second = new YoucamRedis(other, shared);

    for (let i = 0; i < bucket.burst; i++) await first.acquire();
    const elapsed = await timed(() => second.acquire());

    expect(elapsed).toBeGreaterThanOrEqual(bucket.intervalMs / 2);
    other.disconnect();
  });

  it('refuses a call that would queue for longer than it may wait, and takes no slot for it', async (ctx) => {
    if (!redis) return ctx.skip();
    const shared = keys();
    const limiter = new YoucamRedis(redis as IORedis, shared);
    const backlog = Date.now() + bucket.maxWaitMs * 10;
    await redis?.set(shared.bucket, backlog);

    await expect(limiter.acquire()).rejects.toMatchObject({ kind: 'rate_limited' });

    expect(await redis?.get(shared.bucket)).toBe(String(backlog));
  });

  it('fails the call before it is sent when Redis cannot be reached', async () => {
    const down = new IORedis('redis://127.0.0.1:1', { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
    const limiter = new YoucamRedis(down, keys());

    await expect(limiter.acquire()).rejects.toMatchObject({ kind: 'transient' });
    down.disconnect();
  });
});

describe('the live switch', () => {
  it('is on until tripped, and then off for every connection', async (ctx) => {
    if (!redis) return ctx.skip();
    const shared = keys();
    const one = new YoucamRedis(redis as IORedis, shared);
    const other = new IORedis(redis?.options ?? {});
    const two = new YoucamRedis(other, shared);
    expect(await two.offReason()).toBeNull();

    await one.trip('out_of_units');

    expect(await two.offReason()).toBe('out_of_units');
    other.disconnect();
  });

  it('fails closed on a value it does not know', async (ctx) => {
    if (!redis) return ctx.skip();
    const shared = keys();
    await redis?.set(shared.liveOff, 'maybe');

    await expect(new YoucamRedis(redis as IORedis, shared).offReason()).rejects.toMatchObject({ kind: 'live_disabled' });
  });

  it('fails closed when Redis cannot be read', async () => {
    const down = new IORedis('redis://127.0.0.1:1', { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });

    await expect(new YoucamRedis(down, keys()).offReason()).rejects.toMatchObject({ kind: 'live_disabled' });
    down.disconnect();
  });
});

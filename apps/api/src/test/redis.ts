import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';

/**
 * A connection to the Redis tests use (`REDIS_TEST_URL`, default the local one from `pnpm db:up`),
 * or undefined when none answers, so a laptop without Docker still runs the rest of the suite. CI
 * provides one, and there an unreachable Redis fails the run instead of skipping.
 */
export async function connectTestRedis(): Promise<IORedis | undefined> {
  const redis = new IORedis(process.env.REDIS_TEST_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    return redis;
  } catch (cause) {
    redis.disconnect();
    if (process.env.CI) throw new Error('CI must provide Redis for the tests that need it', { cause });
    return undefined;
  }
}

/** A key prefix no other test shares, so tests need not clean up or run in order. */
export const uniqueKey = (name: string) => `test:${name}:${randomUUID()}`;

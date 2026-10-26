import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional, type OnApplicationShutdown } from '@nestjs/common';
import IORedis from 'ioredis';
import { z } from 'zod';

export const PROFILE_LOCK_REDIS_URL = Symbol('PROFILE_LOCK_REDIS_URL');
export const PROFILE_LOCK_TTL_MS = Symbol('PROFILE_LOCK_TTL_MS');

/** How long a lock outlives its holder. A killed worker frees its profile after this. */
export const LOCK_TTL_MS = 60_000;

// Only the holder may extend or release: the token check stops a worker whose lock already expired
// from freeing the next worker's lock.
const extendScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end return 0`;
const releaseScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

const flagSchema = z.number().int().min(0).max(1);

/**
 * One run per profile at a time across every worker (docs/agent.md). A run that finds its profile
 * busy does not run, and the queue tries it again later.
 */
@Injectable()
export class ProfileLock implements OnApplicationShutdown {
  private readonly log = new Logger(ProfileLock.name);
  private redis?: IORedis;

  constructor(
    @Inject(PROFILE_LOCK_REDIS_URL) private readonly redisUrl: string,
    @Optional() @Inject(PROFILE_LOCK_TTL_MS) private readonly ttlMs: number = LOCK_TTL_MS,
  ) {}

  /**
   * Runs `work` while holding the profile's lock, and keeps the lock alive until it ends.
   * @returns The work's result, or `busy` without running it when another worker holds the lock.
   */
  async run<T>(profileId: string, work: () => Promise<T>): Promise<{ kind: 'done'; value: T } | { kind: 'busy' }> {
    this.redis ??= new IORedis(this.redisUrl, { maxRetriesPerRequest: 2 });
    const redis = this.redis;
    const key = `profile-lock:${profileId}`;
    const token = randomUUID();

    if ((await redis.set(key, token, 'PX', this.ttlMs, 'NX')) === null) return { kind: 'busy' };

    // A lost lock cannot stop the run in flight. It is logged, and the run's own idempotency (the
    // task rows) is what keeps a second worker from paying twice.
    const heartbeat = setInterval(() => {
      redis
        .eval(extendScript, 1, key, token, this.ttlMs)
        .then((held) => {
          if (flagSchema.parse(held) === 0) this.log.error(`Lost the lock on profile ${profileId} during a run`);
        })
        .catch((error: unknown) => this.log.error(`Could not extend the lock on profile ${profileId}: ${error instanceof Error ? error.message : 'unknown error'}`));
    }, this.ttlMs / 3);
    try {
      return { kind: 'done', value: await work() };
    } finally {
      clearInterval(heartbeat);
      // If Redis is down the lock expires on its own, and the work's result must not be lost to it.
      await redis.eval(releaseScript, 1, key, token).catch((error: unknown) => {
        this.log.error(`Could not release the lock on profile ${profileId}: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }
  }

  onApplicationShutdown(): void {
    this.redis?.disconnect();
  }
}

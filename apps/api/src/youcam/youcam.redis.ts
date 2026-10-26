import { Logger, type OnApplicationShutdown } from '@nestjs/common';
import type IORedis from 'ioredis';
import { z } from 'zod';
import type { LiveOffReason, LiveSwitch, RateLimiter } from './youcam.client';
import { bucket } from './youcam.constants';
import { YoucamError } from './youcam.errors';

/** Where the bucket and the switch live in Redis. Tests pass their own so runs do not share state. */
export interface YoucamRedisKeys {
  bucket: string;
  liveOff: string;
}
const defaultKeys: YoucamRedisKeys = { bucket: 'youcam:bucket', liveOff: 'youcam:live-off' };

// Generic cell rate algorithm: Redis keeps one number, the time the bucket would be empty. A request
// takes the next slot, so callers queue in order instead of retrying against each other. Redis' own
// clock is used so workers on different machines agree. Every number is a whole millisecond count.
const takeSlot = `
local time = redis.call('TIME')
local now = time[1] * 1000 + math.floor(time[2] / 1000)
local interval, tolerance, maxWait = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local empty = tonumber(redis.call('GET', KEYS[1]))
if not empty or empty < now then empty = now end
local wait = math.max(0, empty - now - tolerance)
if wait > maxWait then return -1 end
redis.call('SET', KEYS[1], empty + interval, 'PX', empty + interval - now + tolerance + 1000)
return wait
`;

const slotSchema = z.number().int().min(-1);
const liveOffSchema = z.enum(['auth', 'out_of_units']);

/**
 * The state every API and worker process shares through Redis (docs/architecture.md section 6): the
 * token bucket that paces requests to YouCam, and the switch that stops live calls once YouCam
 * rejects the key or has no units left. Turn live calls back on with `redis-cli del youcam:live-off`.
 */
export class YoucamRedis implements RateLimiter, LiveSwitch, OnApplicationShutdown {
  private readonly log = new Logger(YoucamRedis.name);

  /** Give the connection `lazyConnect` and a low `maxRetriesPerRequest`, so replay never connects and an outage fails the call fast. */
  constructor(
    private readonly redis: IORedis,
    private readonly keys: YoucamRedisKeys = defaultKeys,
  ) {}

  async acquire(): Promise<void> {
    let wait: number;
    try {
      wait = slotSchema.parse(
        await this.redis.eval(takeSlot, 1, this.keys.bucket, bucket.intervalMs, (bucket.burst - 1) * bucket.intervalMs, bucket.maxWaitMs),
      );
    } catch (cause) {
      throw new YoucamError('transient', 'The shared rate limit could not be read', { cause });
    }
    if (wait < 0) throw new YoucamError('rate_limited', 'The shared rate limit has a longer queue than a call may wait for');
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }

  async offReason(): Promise<LiveOffReason | null> {
    try {
      const stored = await this.redis.get(this.keys.liveOff);
      return stored === null ? null : liveOffSchema.parse(stored);
    } catch (cause) {
      throw new YoucamError('live_disabled', 'The live switch could not be read', { cause });
    }
  }

  async trip(reason: LiveOffReason): Promise<void> {
    // The call that tripped it is already failing with the real error, so a Redis outage here is only logged.
    try {
      await this.redis.set(this.keys.liveOff, reason);
    } catch (error) {
      this.log.error(`Could not switch live calls off after ${reason}: ${error instanceof Error ? error.message : 'unknown error'}`);
      return;
    }
    this.log.error(`Live calls switched off: ${reason}. Fix the cause, then run: redis-cli del ${this.keys.liveOff}`);
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}

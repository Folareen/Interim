import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const SAFETY_REDIS_URL = Symbol('SAFETY_REDIS_URL');

/** The BullMQ queue the HTTP process adds safety reviews to and the worker takes them from. */
export const SAFETY_QUEUE_NAME = 'safety';

/** What the HTTP process needs from the queue. Provided under `SAFETY_QUEUE`, so tests can stand in for it. */
export interface SafetyQueue {
  /** Queues a review. Adding the same review again does nothing, because the job id is the review id. */
  enqueue(reviewId: string): Promise<void>;
}
export const SAFETY_QUEUE = Symbol('SAFETY_QUEUE');

/** Adds reviews to Redis. The connection opens on first use. */
@Injectable()
export class BullSafetyQueue implements SafetyQueue, OnApplicationShutdown {
  private connection?: IORedis;
  private queue?: Queue;

  constructor(@Inject(SAFETY_REDIS_URL) private readonly redisUrl: string) {}

  async enqueue(reviewId: string): Promise<void> {
    this.connection ??= new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.queue ??= new Queue(SAFETY_QUEUE_NAME, { connection: this.connection });
    // A review only writes a verdict, so a retry is safe. Jobs carry the id only (docs/backend.md, Queues).
    await this.queue.add('review', { reviewId }, { jobId: reviewId, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
    this.connection?.disconnect();
  }
}

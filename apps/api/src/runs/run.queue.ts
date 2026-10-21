import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const RUNS_REDIS_URL = Symbol('RUNS_REDIS_URL');

/** The BullMQ queue the HTTP process adds runs to and the worker process takes them from (docs/architecture.md section 8). */
export const RUN_QUEUE_NAME = 'run';

/** What the HTTP process needs from the queue. Provided under `RUN_QUEUE`, so tests can stand in for it. */
export interface RunQueue {
  /** Queues a run. Adding the same run again does nothing, because the job id is the run id. */
  enqueue(runId: string): Promise<void>;
}
export const RUN_QUEUE = Symbol('RUN_QUEUE');

/** Adds runs to Redis. The connection opens on first use, so a process that never queues a run never connects. */
@Injectable()
export class BullRunQueue implements RunQueue, OnApplicationShutdown {
  private connection?: IORedis;
  private queue?: Queue;

  constructor(@Inject(RUNS_REDIS_URL) private readonly redisUrl: string) {}

  async enqueue(runId: string): Promise<void> {
    this.connection ??= new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.queue ??= new Queue(RUN_QUEUE_NAME, { connection: this.connection });
    // One try: a run that fails is marked failed and the person starts it again, so a replay of a
    // failed job could not spend twice. Jobs carry the id only (docs/backend.md, Queues).
    await this.queue.add('run', { runId }, { jobId: runId, attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
    this.connection?.disconnect();
  }
}

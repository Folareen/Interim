import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { CleanupService } from './cleanup.service';

export const CLEANUP_REDIS_URL = Symbol('CLEANUP_REDIS_URL');
const QUEUE = 'cleanup';
const SWEEP_EVERY_MS = 60 * 60 * 1000; // deletions also run inline, so this is the backstop

/** Runs the cleanup sweep on a schedule. Started only by the worker process, never by HTTP. */
@Injectable()
export class CleanupWorker implements OnApplicationShutdown {
  private readonly log = new Logger(CleanupWorker.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(CleanupService) private readonly cleanup: CleanupService,
    @Inject(CLEANUP_REDIS_URL) private readonly redisUrl: string,
  ) {}

  async start(): Promise<void> {
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection });
    // Idempotent: restarting the worker updates the one schedule instead of adding another.
    await this.queue.upsertJobScheduler('cleanup-sweep', { every: SWEEP_EVERY_MS }, { name: 'sweep' });

    this.worker = new Worker(
      QUEUE,
      async () => {
        const { missingPhotoIds, ...counts } = await this.cleanup.run();
        const summary = { ...counts, missingPhotos: missingPhotoIds.length };
        this.log.log(JSON.stringify(summary));
        return summary;
      },
      { connection: this.connection },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}

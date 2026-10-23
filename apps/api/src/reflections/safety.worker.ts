import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { z } from 'zod';
import { ReflectionsService } from './reflections.service';
import { SAFETY_QUEUE, SAFETY_QUEUE_NAME, SAFETY_REDIS_URL, type SafetyQueue } from './safety.queue';

// A queue message is a boundary like any other input (docs/typescript.md).
const jobSchema = z.object({ reviewId: z.string().uuid() });

/** Takes flagged reflections off the queue and stores the model's verdict. Started only by the worker process. */
@Injectable()
export class SafetyWorker implements OnApplicationShutdown {
  private readonly log = new Logger(SafetyWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    @Inject(ReflectionsService) private readonly reflections: ReflectionsService,
    @Inject(SAFETY_QUEUE) private readonly queue: SafetyQueue,
    @Inject(SAFETY_REDIS_URL) private readonly redisUrl: string,
  ) {}

  async start(): Promise<void> {
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker(
      SAFETY_QUEUE_NAME,
      async (job) => {
        const { reviewId } = jobSchema.parse(job.data);
        await this.reflections.review(reviewId);
      },
      { connection: this.connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => this.log.error(`Safety job ${job?.id ?? '?'} failed: ${error.message}`));
    // A review lost before it was queued would leave a flag pending for good.
    for (const id of await this.reflections.pendingReviewIds()) await this.queue.enqueue(id);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}

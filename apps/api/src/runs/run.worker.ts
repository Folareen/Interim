import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { z } from 'zod';
import { AgentService } from '../agent/agent.service';
import { RUNS_REDIS_URL, RUN_QUEUE_NAME } from './run.queue';

// A queue message is a boundary like any other input (docs/typescript.md).
const jobSchema = z.object({ runId: z.string().uuid() });

/**
 * Takes runs off the queue and runs the agent. Started only by the worker process, never by HTTP.
 * One run at a time per worker, which also means one per profile; scaling to several workers needs
 * a per profile lock first (docs/agent.md).
 */
@Injectable()
export class RunWorker implements OnApplicationShutdown {
  private readonly log = new Logger(RunWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    @Inject(AgentService) private readonly agent: AgentService,
    @Inject(RUNS_REDIS_URL) private readonly redisUrl: string,
  ) {}

  start(): void {
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker(
      RUN_QUEUE_NAME,
      async (job) => {
        const { runId } = jobSchema.parse(job.data);
        await this.agent.run(runId);
      },
      { connection: this.connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => this.log.error(`Run job ${job?.id ?? '?'} failed: ${error.message}`));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}

import { type Db, run, snapshot, styleRequest } from '@interim/db';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { DelayedError, Worker } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import IORedis from 'ioredis';
import { z } from 'zod';
import { AgentService } from '../agent/agent.service';
import { StyleRenderService } from '../style/style-render.service';
import { DB } from '../db/db.token';
import { ProfileLock } from './profile-lock';
import { RUNS_REDIS_URL, RUN_QUEUE_NAME } from './run.queue';

// A queue message is a boundary like any other input (docs/typescript.md).
const jobSchema = z.object({ runId: z.string().uuid() });

// How long a run waits when its profile is busy. The holder's lock outlives a killed worker by under
// a minute, so a redelivered run gets through after that.
const BUSY_RETRY_MS = 15_000;

/**
 * Takes runs off the queue and runs the agent. Started only by the worker process, never by HTTP.
 * A worker takes one run at a time and `ProfileLock` keeps two workers off one profile.
 */
@Injectable()
export class RunWorker implements OnApplicationShutdown {
  private readonly log = new Logger(RunWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    @Inject(AgentService) private readonly agent: AgentService,
    @Inject(StyleRenderService) private readonly style: StyleRenderService,
    @Inject(RUNS_REDIS_URL) private readonly redisUrl: string,
    @Inject(DB) private readonly db: Db,
    @Inject(ProfileLock) private readonly lock: ProfileLock,
  ) {}

  /**
   * Runs one queued run, unless another worker is already running the same profile.
   * @returns `busy` when the run did not start and should be tried again later.
   */
  async process(runId: string): Promise<'done' | 'busy'> {
    const [row] = await this.db
      .select({ profileId: sql<string>`coalesce(${snapshot.profileId}, ${styleRequest.profileId})`, styleRequestId: run.styleRequestId })
      .from(run)
      .leftJoin(snapshot, eq(snapshot.id, run.snapshotId))
      .leftJoin(styleRequest, eq(styleRequest.id, run.styleRequestId))
      .where(eq(run.id, runId));
    if (!row) throw new Error(`Run ${runId} does not exist`);
    const outcome = await this.lock.run(row.profileId, () =>
      row.styleRequestId ? this.style.render(runId) : this.agent.run(runId),
    );
    return outcome.kind === 'busy' ? 'busy' : 'done';
  }

  start(): void {
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker(
      RUN_QUEUE_NAME,
      async (job, token) => {
        const { runId } = jobSchema.parse(job.data);
        if ((await this.process(runId)) === 'busy') {
          // Delaying is not a failed try, so it does not use up the job's one attempt.
          await job.moveToDelayed(Date.now() + BUSY_RETRY_MS, token);
          throw new DelayedError();
        }
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

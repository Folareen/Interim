import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { NotificationsService } from './notifications.service';

export const NOTIFICATIONS_REDIS_URL = Symbol('NOTIFICATIONS_REDIS_URL');
const QUEUE = 'notifications';
const EVERY_MS = 60 * 60 * 1000;

/** Sends the notifications that are due, once an hour. Started only by the worker process, never by HTTP. */
@Injectable()
export class NotificationsWorker implements OnApplicationShutdown {
  private readonly log = new Logger(NotificationsWorker.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(NOTIFICATIONS_REDIS_URL) private readonly redisUrl: string,
  ) {}

  async start(): Promise<void> {
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection });
    // Idempotent: restarting the worker updates the one schedule instead of adding another.
    await this.queue.upsertJobScheduler('notifications-hourly', { every: EVERY_MS }, { name: 'send-due' });

    this.worker = new Worker(
      QUEUE,
      async () => {
        const sent = await this.notifications.sendDue();
        this.log.log(JSON.stringify({ sent }));
        return { sent };
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

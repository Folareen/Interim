import { createHash, randomUUID } from 'node:crypto';
import { type Db, callCache, youcamTask } from '@interim/db';
import type { CaptureProblem, MeasureTool, RenderTool, TraceReason } from '@interim/types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.token';
import { BudgetExceededError, LedgerService } from '../ledger/ledger.service';
import { StorageService } from '../storage/storage.service';
import { YoucamClient, type TaskRef } from './youcam.client';
import { unitCosts } from './youcam.constants';
import { YoucamError, retakeProblem } from './youcam.errors';
import { type ToolName, type ToolRequest, type ToolResult, tools } from './youcam.tools';

/** How long to wait between polls and for how long, from the environment. Tests use zero. */
export interface GatewayConfig {
  firstPollMs: number;
  maxPollMs: number;
  timeoutMs: number;
}
export const GATEWAY_CONFIG = Symbol('GATEWAY_CONFIG');

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const TRANSIENT_ATTEMPTS = 4;

/** What a call needs besides its tool: who it is for, which caps apply and which photos it sends. */
export interface CallContext {
  profileId: string;
  runId: string;
  /** The run's own cap in units. */
  runBudgetUnits: number;
  /** Keyed hash of the caller's address, for the per source daily cap. */
  sourceHash?: string;
  photos: readonly { objectKey: string; sha256: string }[];
}

/** A call that did not produce a result, and why. The run records it and moves on. */
export type CallFailure =
  | { kind: 'blocked'; reason: TraceReason }
  | { kind: 'retake'; problem: CaptureProblem }
  | { kind: 'not_recorded' }
  | { kind: 'stop'; reason: TraceReason };

/** A measurement. `taskId` is null when a recorded result was reused, which costs nothing. */
export type MeasureOutcome<T extends MeasureTool> =
  | { kind: 'result'; result: ToolResult<T>; reused: boolean; taskId: string | null; units: number }
  | CallFailure;

/** A render, already stored under `objectKey`. */
export type RenderOutcome =
  | { kind: 'image'; objectKey: string; reused: boolean; taskId: string | null; units: number }
  | CallFailure;

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * Names a call's fixture: the photos, the tool's API version and its parameters. It is also the
 * call_cache key without the profile, so a recorded result is found for the same picture and request.
 */
export function youcamFixtureKey(sha256s: readonly string[], tool: ToolName, params: Record<string, string | number | boolean>): string {
  const photoPart = hash(sha256s.join(',')).slice(0, 16);
  const paramPart = hash(`${tools[tool].version}:${JSON.stringify(params, Object.keys(params).sort())}`).slice(0, 12);
  return `${photoPart}-${paramPart}`;
}

/**
 * The one path every YouCam call takes (docs/architecture.md section 6): reuse a recorded result,
 * reserve units, write the task row before sending, upload, create, poll, then settle and cache.
 * It owns the ledger, task rows and call cache that the client leaves to its caller, and it can be
 * run again for the same call without sending a second create (docs/product/spec.md section 10).
 */
@Injectable()
export class YoucamGateway {
  private readonly log = new Logger(YoucamGateway.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(YoucamClient) private readonly client: YoucamClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig,
  ) {}

  /** Takes one measurement. `params` and `body` describe the request beyond the uploaded photos. */
  async measure<T extends MeasureTool>(
    context: CallContext,
    tool: T,
    params: Record<string, string | number | boolean>,
    body: (fileIds: string[]) => ToolRequest<T>,
  ): Promise<MeasureOutcome<T>> {
    const key = this.keys(context, tool, params);
    const cached = await this.lookup(key.cache);
    if (cached?.outcome === 'blocked') return { kind: 'blocked', reason: 'blocked_tool' };
    if (cached?.resultRef) {
      const result = tools[tool].result.parse(JSON.parse(cached.resultRef)) as ToolResult<T>;
      return { kind: 'result', result, reused: true, taskId: null, units: 0 };
    }

    const done = await this.submit(context, tool, key, body, (result) => Promise.resolve(JSON.stringify(result)));
    if (done.kind !== 'done') return done;
    const result = tools[tool].result.parse(JSON.parse(done.resultRef)) as ToolResult<T>;
    return { kind: 'result', result, reused: false, taskId: done.taskId, units: done.units };
  }

  /**
   * Makes one preview and stores its image under `imageKey`. A recorded result for the same photo,
   * tool and parameters is copied to `imageKey` instead of asking YouCam again.
   */
  async render(
    context: CallContext,
    tool: RenderTool,
    imageKey: string,
    params: Record<string, string | number | boolean>,
    body: (fileIds: string[]) => ToolRequest<RenderTool>,
  ): Promise<RenderOutcome> {
    const key = this.keys(context, tool, params);
    const cached = await this.lookup(key.cache);
    if (cached?.outcome === 'blocked') return { kind: 'blocked', reason: 'blocked_tool' };
    if (cached?.resultRef) {
      // A copy, because expiry deletes a render's file and another snapshot may still show the first one.
      const image = await this.storage.readCapped(cached.resultRef, MAX_PHOTO_BYTES);
      if (image && image !== 'too_large') {
        await this.storage.put(imageKey, image, 'image/jpeg');
        return { kind: 'image', objectKey: imageKey, reused: true, taskId: null, units: 0 };
      }
    }

    const done = await this.submit(context, tool, key, body, async (result, ref) => {
      const url = tools[tool].result.parse(result).url;
      const image = await this.withRetry(() => this.client.getResultImage(ref, url));
      await this.storage.put(imageKey, image, 'image/jpeg');
      return imageKey;
    });
    if (done.kind !== 'done') return done;
    return { kind: 'image', objectKey: done.resultRef, reused: false, taskId: done.taskId, units: done.units };
  }

  // Everything between "no recorded result" and "result recorded". `finish` turns the tool's result
  // into what the cache keeps; it runs before the ledger settles, so a failure there leaves the task
  // open and the next run polls it again instead of paying for a second one.
  private async submit<T extends ToolName>(
    context: CallContext,
    tool: T,
    key: Keys,
    body: (fileIds: string[]) => ToolRequest<T>,
    finish: (result: unknown, ref: TaskRef) => Promise<string>,
  ): Promise<({ kind: 'done'; resultRef: string; taskId: string; units: number }) | CallFailure> {
    let existing = await this.findTask(context, key);
    if (existing?.state === 'failed' && !existing.youcamTaskId) {
      // It failed before anything was created at YouCam and its units were released, so trying again
      // is safe. It gets a new task id, because the ledger has already closed the old one.
      await this.db.delete(youcamTask).where(eq(youcamTask.id, existing.id));
      existing = undefined;
    }
    if (existing && (existing.state === 'intent' || existing.state === 'unknown')) {
      // A crash between writing the row and storing YouCam's id: the task may exist, so never send again.
      await this.setTask(existing.id, { state: 'unknown' });
      return { kind: 'stop', reason: 'stopped_error' };
    }
    if (existing && (existing.state === 'done' || existing.state === 'failed')) {
      return { kind: 'stop', reason: 'stopped_error' };
    }

    const call = {
      profileId: context.profileId,
      runId: context.runId,
      runBudgetUnits: context.runBudgetUnits,
      sourceHash: context.sourceHash,
    };
    const cost = priceOf(tool);

    let taskId = existing?.id;
    let ref: TaskRef | undefined =
      existing?.youcamTaskId ? { tool, fixtureKey: key.fixture, taskId: existing.youcamTaskId } : undefined;

    if (!taskId) {
      taskId = randomUUID();
      try {
        await this.ledger.reserve({ ...call, taskId, tool, units: cost });
      } catch (error) {
        if (error instanceof BudgetExceededError) return { kind: 'blocked', reason: 'blocked_budget' };
        throw error;
      }
      await this.db
        .insert(youcamTask)
        .values({ id: taskId, profileId: context.profileId, runId: context.runId, tool, cacheKey: key.fixture });
    }
    const settle = (units: number) => this.ledger.settle({ ...call, taskId }, units);

    try {
      if (!ref) {
        const photos = await this.readPhotos(context);
        if (!photos) {
          await this.ledger.release({ ...call, taskId });
          await this.setTask(taskId, { state: 'failed' });
          return { kind: 'blocked', reason: 'blocked_photo' };
        }
        const fileIds = await this.withRetry(async () =>
          Promise.all(
            photos.map((bytes, i) =>
              this.client.uploadPhoto({ bytes, contentType: 'image/jpg', fileName: `photo-${i}.jpg` }),
            ),
          ),
        );
        ref = await this.client.createTask(tool, body(fileIds), key.fixture);
        await this.setTask(taskId, { state: 'created', youcamTaskId: ref.taskId });
      }

      const outcome = await this.poll(ref);
      if (outcome.state === 'timeout') return { kind: 'stop', reason: 'stopped_error' };
      if (outcome.state === 'error') {
        await this.setTask(taskId, { state: 'failed' });
        // A failed task costs nothing (spec section 10).
        await settle(0);
        if (outcome.action === 'block_tool') {
          await this.remember(context, key, tool, 'blocked', null);
          return { kind: 'blocked', reason: 'blocked_tool' };
        }
        if (outcome.action === 'new_photo') return { kind: 'retake', problem: retakeProblem(outcome.code) };
        this.log.error(`YouCam task failed with ${outcome.code}`);
        return { kind: 'stop', reason: 'stopped_error' };
      }

      const resultRef = await finish(outcome.result, ref);
      // Replay and judge mode cost nothing, so the ledger shows zero there.
      const units = this.client.mode === 'replay' ? 0 : cost;
      await settle(units);
      await this.setTask(taskId, { state: 'done' });
      await this.remember(context, key, tool, 'success', resultRef);
      return { kind: 'done', resultRef, taskId, units };
    } catch (error) {
      return this.afterThrow(error, call, taskId, ref !== undefined);
    }
  }

  // A throw before the create call left nothing at YouCam, so the units are released. After it,
  // the task may exist and its reservation stays held until it is resolved.
  private async afterThrow(
    error: unknown,
    call: { profileId: string; runId: string; runBudgetUnits: number; sourceHash?: string },
    taskId: string,
    created: boolean,
  ): Promise<CallFailure> {
    if (!(error instanceof YoucamError)) throw error;
    if (error.kind === 'replay_missing') {
      // Only replay raises this, and a replayed task is never real, so there is nothing to hold.
      await this.ledger.release({ ...call, taskId });
      await this.setTask(taskId, { state: 'failed' });
      return { kind: 'not_recorded' };
    }
    if (error.kind === 'unknown_outcome') {
      await this.setTask(taskId, { state: 'unknown' });
      return { kind: 'stop', reason: 'stopped_error' };
    }
    if (created) {
      this.log.warn(`YouCam ${error.kind} while waiting on a created task`);
      return { kind: 'stop', reason: 'stopped_error' };
    }
    await this.ledger.release({ ...call, taskId });
    await this.setTask(taskId, { state: 'failed' });
    this.log.error(`YouCam ${error.kind}: ${error.message}`);
    return { kind: 'stop', reason: 'stopped_error' };
  }

  private async poll(ref: TaskRef) {
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      const status = await this.withRetry(() => this.client.getTask(ref));
      if (status.state !== 'running') return status;
      if (Date.now() - started > this.config.timeoutMs) return { state: 'timeout' as const };
      await sleep(Math.min(this.config.firstPollMs * 1.5 ** attempt, this.config.maxPollMs));
    }
  }

  // Retries only what is safe to repeat: an upload, a poll or a download, never a create.
  private async withRetry<R>(action: () => Promise<R>): Promise<R> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await action();
      } catch (error) {
        if (!(error instanceof YoucamError) || error.kind !== 'transient' || attempt >= TRANSIENT_ATTEMPTS) throw error;
        await sleep(this.config.firstPollMs * attempt);
      }
    }
  }

  private async readPhotos(context: CallContext): Promise<Buffer[] | undefined> {
    const photos: Buffer[] = [];
    for (const { objectKey } of context.photos) {
      const bytes = await this.storage.readCapped(objectKey, MAX_PHOTO_BYTES);
      // Expired or missing: the tool cannot run on a photo that is gone.
      if (!bytes || bytes === 'too_large') return undefined;
      photos.push(bytes);
    }
    return photos;
  }

  private keys(context: CallContext, tool: ToolName, params: Record<string, string | number | boolean>): Keys {
    const fixture = youcamFixtureKey(context.photos.map((p) => p.sha256), tool, params);
    return { fixture, cache: `${context.profileId}:${tool}:${fixture}` };
  }

  private async lookup(key: string) {
    const [row] = await this.db.select().from(callCache).where(eq(callCache.key, key));
    return row;
  }

  private async remember(context: CallContext, key: Keys, tool: ToolName, outcome: 'success' | 'blocked', resultRef: string | null) {
    await this.db
      .insert(callCache)
      .values({ key: key.cache, profileId: context.profileId, tool, outcome, resultRef })
      .onConflictDoNothing();
  }

  private async findTask(context: CallContext, key: Keys) {
    const [row] = await this.db
      .select()
      .from(youcamTask)
      .where(and(eq(youcamTask.runId, context.runId), eq(youcamTask.cacheKey, key.fixture)));
    return row;
  }

  private async setTask(id: string, change: { state: 'created' | 'done' | 'failed' | 'unknown'; youcamTaskId?: string }) {
    await this.db.update(youcamTask).set({ ...change, updatedAt: new Date() }).where(eq(youcamTask.id, id));
  }
}

interface Keys {
  /** Names the fixture and identifies the task within a run. */
  fixture: string;
  /** The call_cache key, which also carries the profile. */
  cache: string;
}

function priceOf(tool: ToolName): number {
  const price = unitCosts[tool];
  if (price === null || price === undefined) throw new Error(`No confirmed price for ${tool}`);
  return price;
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

import { type Db, photo, profile, render, run, snapshot, stageCard, traceEntry } from '@interim/db';
import { hasCurrentConsent } from '@interim/rules';
import { templates } from '@interim/templates';
import {
  type CardSummary,
  type CardView,
  type RunView,
  captureProblemSchema,
  stageCardSchema,
  templateKeySchema,
  traceReasonSchema,
} from '@interim/types';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  type Observable,
  concatMap,
  interval,
  map,
  startWith,
  takeUntil,
  takeWhile,
  timer,
} from 'rxjs';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { StorageService } from '../storage/storage.service';
import { RUN_QUEUE, type RunQueue } from './run.queue';

/** Settings the runs module takes from the environment. */
export interface RunsConfig {
  /** The most units one run may spend, whatever the template asks for. */
  runBudgetCap: number;
}
export const RUNS_CONFIG = Symbol('RUNS_CONFIG');

const STREAM_EVERY_MS = 1000;
const STREAM_LIMIT_MS = 10 * 60 * 1000;

/** Starting runs and reading their progress and cards. Every lookup joins on the owner, so another person's id answers 404. */
@Injectable()
export class RunsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(RUN_QUEUE) private readonly queue: RunQueue,
    @Inject(RUNS_CONFIG) private readonly config: RunsConfig,
  ) {}

  /**
   * Starts the agent for a snapshot. Starting it again returns the same run, and re-queues it if it
   * never left the queue, so a failed enqueue is recovered by asking again.
   * @param sourceHash Keyed hash of the caller's address, for the per source daily cap.
   * @throws ForbiddenException before the person has consented to the current text.
   */
  async start(snapshotId: string, owner: Owner, sourceHash: string): Promise<RunView> {
    const [row] = await this.db
      .select({ profile })
      .from(snapshot)
      .innerJoin(profile, eq(profile.id, snapshot.profileId))
      .where(and(eq(snapshot.id, snapshotId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    if (!hasCurrentConsent(row.profile))
      throw new ForbiddenException('Please accept the current consent text first.');

    const template = templates[templateKeySchema.parse(row.profile.templateKey)];
    await this.db
      .insert(run)
      .values({
        snapshotId,
        templateKey: template.key,
        templateVersion: template.version,
        budgetUnits: Math.min(template.unitBudgetPerRun, this.config.runBudgetCap),
        sourceHash,
      })
      .onConflictDoNothing();
    const [started] = await this.db.select().from(run).where(eq(run.snapshotId, snapshotId));
    if (!started) throw new Error(`Run for snapshot ${snapshotId} was not stored`);
    if (started.status === 'queued') await this.queue.enqueue(started.id);
    return this.view(started.id);
  }

  /** Where a run stands, with its trace so far. */
  async get(runId: string, owner: Owner): Promise<RunView> {
    await this.owned(runId, owner);
    return this.view(runId);
  }

  /** The run's progress once a second until it finishes, for server sent events. */
  async events(runId: string, owner: Owner): Promise<Observable<{ data: RunView }>> {
    await this.owned(runId, owner);
    return interval(STREAM_EVERY_MS).pipe(
      startWith(0),
      concatMap(() => this.view(runId)),
      // Include the finishing state, then end the stream.
      takeWhile((view) => view.status === 'queued' || view.status === 'running', true),
      takeUntil(timer(STREAM_LIMIT_MS)),
      map((data) => ({ data })),
    );
  }

  /** A card, with short lived links to its images. */
  async card(cardId: string, owner: Owner): Promise<CardView> {
    const [row] = await this.db
      .select({
        id: stageCard.id,
        profileId: stageCard.profileId,
        card: stageCard.card,
        approvedAt: stageCard.approvedAt,
        snapshotId: run.snapshotId,
      })
      .from(stageCard)
      .innerJoin(profile, eq(profile.id, stageCard.profileId))
      .innerJoin(run, eq(run.id, stageCard.runId))
      .where(and(eq(stageCard.id, cardId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    const { snapshotId } = row;
    const card = stageCardSchema.parse(row.card);

    const renders = await this.db
      .select({ id: render.id, key: render.objectKey })
      .from(render)
      .where(
        inArray(
          render.id,
          [...card.options, ...card.clothes].map((o) => o.renderId),
        ),
      );
    const renderUrls: Record<string, string> = {};
    for (const r of renders) if (r.key) renderUrls[r.id] = await this.storage.presignGet(r.key);

    const photos = await this.db
      .select({ kind: photo.kind, key: photo.objectKey })
      .from(photo)
      .where(and(eq(photo.snapshotId, snapshotId), inArray(photo.kind, ['front', 'body'])));
    const urlOf = async (kind: 'front' | 'body') => {
      const found = photos.find((p) => p.kind === kind);
      return found ? this.storage.presignGet(found.key) : null;
    };
    return {
      id: row.id,
      profileId: row.profileId,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      card,
      renderUrls,
      photoUrl: await urlOf('front'),
      bodyPhotoUrl: await urlOf('body'),
    };
  }

  /** Marks the person's shopping choices as approved. Approving twice keeps the first time. */
  async approve(cardId: string, owner: Owner): Promise<{ approvedAt: string }> {
    const [row] = await this.db
      .select({ id: stageCard.id, approvedAt: stageCard.approvedAt })
      .from(stageCard)
      .innerJoin(profile, eq(profile.id, stageCard.profileId))
      .where(and(eq(stageCard.id, cardId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    const approvedAt = row.approvedAt ?? new Date();
    if (!row.approvedAt)
      await this.db.update(stageCard).set({ approvedAt }).where(eq(stageCard.id, cardId));
    return { approvedAt: approvedAt.toISOString() };
  }

  /** The profile's cards, newest first. */
  async cards(profileId: string, owner: Owner): Promise<CardSummary[]> {
    const rows = await this.db
      .select({ id: stageCard.id, takenAt: snapshot.takenAt, stageKey: snapshot.stageKey })
      .from(stageCard)
      .innerJoin(profile, eq(profile.id, stageCard.profileId))
      .innerJoin(run, eq(run.id, stageCard.runId))
      .innerJoin(snapshot, eq(snapshot.id, run.snapshotId))
      .where(and(eq(stageCard.profileId, profileId), eq(profile.ownerRef, owner.ref)))
      .orderBy(desc(snapshot.takenAt));
    return rows.map((r) => ({
      id: r.id,
      takenAt: r.takenAt.toISOString(),
      stageKey: r.stageKey ?? '',
    }));
  }

  /** The newest run, so returning to Today can resume work instead of starting a second run. */
  async latest(profileId: string, owner: Owner) {
    const [owned] = await this.db
      .select({ id: profile.id })
      .from(profile)
      .where(and(eq(profile.id, profileId), eq(profile.ownerRef, owner.ref)));
    if (!owned) throw new NotFoundException();
    const [latest] = await this.db
      .select({ id: run.id })
      .from(run)
      .innerJoin(snapshot, eq(snapshot.id, run.snapshotId))
      .where(eq(snapshot.profileId, profileId))
      .orderBy(desc(run.createdAt))
      .limit(1);
    return { run: latest ? await this.view(latest.id) : null };
  }

  private async owned(runId: string, owner: Owner) {
    const [row] = await this.db
      .select({ snapshotId: run.snapshotId })
      .from(run)
      .innerJoin(snapshot, eq(snapshot.id, run.snapshotId))
      .innerJoin(profile, eq(profile.id, snapshot.profileId))
      .where(and(eq(run.id, runId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    return row;
  }

  private async view(runId: string): Promise<RunView> {
    const [found] = await this.db
      .select({ run, profileId: snapshot.profileId })
      .from(run)
      .innerJoin(snapshot, eq(snapshot.id, run.snapshotId))
      .where(eq(run.id, runId));
    if (!found) throw new NotFoundException();
    const { run: row, profileId } = found;
    const trace = await this.db
      .select()
      .from(traceEntry)
      .where(eq(traceEntry.runId, runId))
      .orderBy(asc(traceEntry.seq));
    const [card] = await this.db
      .select({ id: stageCard.id })
      .from(stageCard)
      .where(eq(stageCard.runId, runId));
    return {
      id: row.id,
      profileId,
      status: row.status,
      stopReason: traceReasonSchema.nullable().parse(row.stopReason),
      retake: captureProblemSchema.nullable().parse(row.retake),
      cardId: card?.id ?? null,
      trace: trace.map((t) => ({
        seq: t.seq,
        step: t.step,
        reason: traceReasonSchema.parse(t.reason),
        tool: t.tool,
        costUnits: t.costUnits,
      })),
    };
  }
}

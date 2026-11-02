import { createHash, randomUUID } from 'node:crypto';
import { type Db, profile, run, stylePhoto, stylePreview, styleRequest, styleRequestReference } from '@interim/db';
import { STYLE_PREVIEW_UNITS, expiresAt } from '@interim/rules';
import type { TraceReason } from '@interim/types';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { TraceWriter } from '../agent/trace';
import { DB } from '../db/db.token';
import { LedgerService } from '../ledger/ledger.service';
import { type CallContext, YoucamGateway } from '../youcam/youcam.gateway';

// The parameters the recorded experiment used, so its results are found under the same fixture keys.
const CLOTHES_PARAMS = { garment_category: 'full_body', change_shoes: false, filter_multi_person: 'strict' } as const;

/**
 * Makes the previews of one style request, one `cloth_v4` call per reference, always through the
 * gateway so the ledger, dedupe and replay rules apply. Plain code decides what runs; no model is involved.
 */
@Injectable()
export class StyleRenderService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(YoucamGateway) private readonly gateway: YoucamGateway,
    @Inject(LedgerService) private readonly ledger: LedgerService,
  ) {}

  /** Runs one queued style run to `done` or `failed`. A run that already finished does nothing. */
  async render(runId: string): Promise<void> {
    const [row] = await this.db
      .select({ run, request: styleRequest, profile })
      .from(run)
      .innerJoin(styleRequest, eq(styleRequest.id, run.styleRequestId))
      .innerJoin(profile, eq(profile.id, styleRequest.profileId))
      .where(eq(run.id, runId));
    if (!row) throw new Error(`Style run ${runId} does not exist`);
    if (row.run.status === 'done' || row.run.status === 'failed') return;

    await this.db.update(run).set({ status: 'running' }).where(eq(run.id, runId));
    const trace = new TraceWriter(this.db, runId);
    try {
      await this.loop(row.run, row.request, row.profile, trace);
    } catch (error) {
      await trace.add('stop', 'stopped_error').catch(() => undefined);
      await this.db.update(run).set({ status: 'failed', stopReason: 'stopped_error' }).where(eq(run.id, runId));
      throw error;
    }
  }

  private async loop(
    runRow: typeof run.$inferSelect,
    request: typeof styleRequest.$inferSelect,
    owner: typeof profile.$inferSelect,
    trace: TraceWriter,
  ): Promise<void> {
    await trace.reset();
    await trace.add('observe', 'observed');

    const [current] = await this.db.select().from(stylePhoto).where(eq(stylePhoto.id, request.currentPhotoId));
    if (!current) throw new Error(`Current photo of request ${request.id} is missing`);
    const refs = await this.db
      .select({ photo: stylePhoto })
      .from(styleRequestReference)
      .innerJoin(stylePhoto, eq(stylePhoto.id, styleRequestReference.photoId))
      .where(eq(styleRequestReference.requestId, request.id))
      .orderBy(styleRequestReference.position);

    const budget = {
      profileId: owner.id,
      runId: runRow.id,
      runBudgetUnits: runRow.budgetUnits,
      sourceHash: runRow.sourceHash ?? undefined,
    };
    let remaining = await this.ledger.remaining(budget);
    let made = 0;
    let lastReason: TraceReason = 'stopped_complete';
    let missingNoted = false;

    for (const { photo: reference } of refs) {
      const inputHash = createHash('sha256').update(`${current.sha256}:${reference.sha256}:full_body`).digest('hex');
      const [existing] = await this.db
        .select({ id: stylePreview.id })
        .from(stylePreview)
        .where(and(eq(stylePreview.requestId, request.id), eq(stylePreview.referencePhotoId, reference.id)));
      if (existing) {
        made += 1;
        continue;
      }
      if (remaining < STYLE_PREVIEW_UNITS) {
        await trace.add('act', 'blocked_budget', { tool: 'cloth_v4' });
        lastReason = 'stopped_budget';
        break;
      }

      const previewId = randomUUID();
      const imageKey = `renders/${owner.id}/style/${request.id}/${previewId}.jpg`;
      const context: CallContext = {
        ...budget,
        photos: [
          { objectKey: current.objectKey, sha256: current.sha256 },
          { objectKey: reference.objectKey, sha256: reference.sha256 },
        ],
      };
      const outcome = await this.gateway.render(context, 'cloth_v4', imageKey, { ...CLOTHES_PARAMS }, (ids) => ({
        src_file_id: ids[0] ?? '',
        ref_file_id: ids[1] ?? '',
        ...CLOTHES_PARAMS,
      }));

      if (outcome.kind === 'image') {
        await this.db.insert(stylePreview).values({
          id: previewId,
          requestId: request.id,
          referencePhotoId: reference.id,
          inputHash,
          objectKey: outcome.objectKey,
          expiresAt: expiresAt(owner.retention, new Date()),
        });
        made += 1;
        await trace.add('act', outcome.reused ? 'reused' : 'rendered', { tool: 'cloth_v4', costUnits: outcome.units });
        remaining = await this.ledger.remaining(budget);
        continue;
      }
      if (outcome.kind === 'not_recorded') {
        // Each reference is its own call, so one missing answer says nothing about the next.
        if (!missingNoted) await trace.add('act', 'not_recorded', { tool: 'cloth_v4' });
        missingNoted = true;
        lastReason = 'not_recorded';
        continue;
      }
      if (outcome.kind === 'blocked') {
        await trace.add('act', outcome.reason, { tool: 'cloth_v4' });
        lastReason = outcome.reason === 'blocked_budget' ? 'stopped_budget' : outcome.reason;
        // A blocked tool refuses this pair only; a spent budget refuses every pair after it.
        if (outcome.reason === 'blocked_budget') break;
        continue;
      }
      if (outcome.kind === 'retake') {
        await trace.add('act', 'retake_photo', { tool: 'cloth_v4' });
        await this.db.update(run).set({ retake: outcome.problem }).where(eq(run.id, runRow.id));
        lastReason = 'stopped_retake';
        break;
      }
      await trace.add('stop', outcome.reason);
      await this.db.update(run).set({ status: 'failed', stopReason: outcome.reason }).where(eq(run.id, runRow.id));
      return;
    }

    if (made > 0) {
      await trace.add('compose', 'composed');
      await this.db.update(run).set({ status: 'done', stopReason: 'stopped_complete' }).where(eq(run.id, runRow.id));
      return;
    }
    await trace.add('stop', lastReason);
    await this.db.update(run).set({ status: 'failed', stopReason: lastReason }).where(eq(run.id, runRow.id));
  }
}

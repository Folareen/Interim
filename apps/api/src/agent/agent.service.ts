import { createHash, randomUUID } from 'node:crypto';
import {
  type Db,
  measurement,
  photo,
  profile,
  render,
  run,
  selfReport,
  snapshot,
  stageCard,
} from '@interim/db';
import { expiresAt, hairTransferFallback, measurementsDue, placeStage, strategyTools, toolEligibility } from '@interim/rules';
import { type Look, looksByStrategy, messages, templates } from '@interim/templates';
import {
  type CaptureProblem,
  type ChangeReport,
  type MeasureTool,
  type MeasuredValue,
  type PhotoKind,
  type RenderTool,
  type Size,
  type StageCard,
  type Strategy,
  type TraceReason,
  liveLocaleSchema,
  measureTools,
  measuredValueSchema,
  sizeSchema,
  templateKeySchema,
} from '@interim/types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.token';
import { LedgerService } from '../ledger/ledger.service';
import { type CallContext, type CallFailure, YoucamGateway } from '../youcam/youcam.gateway';
import { unitCosts } from '../youcam/youcam.constants';
import type { ToolRequest } from '../youcam/youcam.tools';
import { type Fact, densityDirection, factText, isReliable, luma, reportedChange } from './facts';
import { Planner } from './planner';
import type { PlannerFact, PlannerInput } from './prompts/planner.v1';
import { TraceWriter } from './trace';

/** Most previews one run makes. The spec asks for two to four, and the budget bounds it first. */
const MAX_RENDERS = 3;
const MAX_EARLIER_LOOKS = 2;
// How strongly a brow preview applies its colour, out of 100.
const BROW_INTENSITY = 60;

type RunRow = typeof run.$inferSelect;
type SnapshotRow = typeof snapshot.$inferSelect;
type ProfileRow = typeof profile.$inferSelect;

/** Everything one run reads and keeps in step. */
interface RunContext {
  run: RunRow;
  snapshot: SnapshotRow;
  profile: ProfileRow;
  template: (typeof templates)[keyof typeof templates];
  photos: Map<PhotoKind, { objectKey: string; sha256: string; expiresAt: Date }>;
  report: { changed: ChangeReport; reportedSize: Size | null } | undefined;
  trace: TraceWriter;
  /** Tools that YouCam or the capture check refused during this run. */
  blocked: Set<string>;
  /** The most that can still be spent, refreshed after each paid call. */
  remaining: number;
  /** A reason the run could not use everything it wanted, kept for the final trace line. */
  stopReason: TraceReason;
  retake: CaptureProblem | undefined;
}

/** One stored reading, with the snapshot it came from. */
interface Reading {
  id: string;
  snapshotId: string;
  tool: MeasureTool;
  value: MeasuredValue;
  reliable: boolean;
  at: Date;
}

/** A call that ended the run, rather than a tool that was merely unavailable. */
type Fatal = Extract<CallFailure, { kind: 'not_recorded' | 'stop' }>;

type Measured =
  | { kind: 'value'; value: MeasuredValue; reliable: boolean; taskId: string | null; units: number; reused: boolean }
  | CallFailure;

const srcFile = (ids: string[]) => ({ src_file_id: ids[0] ?? '' });

const factAbout: Record<MeasureTool | 'self_report', string> = {
  hair_density: 'hair density',
  hair_length: 'hair length',
  hair_type: 'hair type',
  face_shape: 'face aspect ratio',
  skin_tone: 'skin colour',
  self_report: 'what the person reported',
};

// Fixed so refs stay the same between runs and recorded plans replay.
const factOrder: readonly MeasureTool[] = ['hair_density', 'hair_length', 'hair_type', 'face_shape', 'skin_tone'];

/**
 * One run of the agent loop (docs/product/spec.md section 8): observe, measure, place, decide,
 * act, compose, stop. Code decides what is allowed and what is spent; the planner only chooses
 * among what is left and writes the note. Every step leaves a coded trace line.
 */
@Injectable()
export class AgentService {
  private readonly log = new Logger(AgentService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(YoucamGateway) private readonly gateway: YoucamGateway,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(Planner) private readonly planner: Planner,
  ) {}

  /**
   * Runs the loop for one run, or does nothing when it has already finished. Safe to deliver twice:
   * measurements, renders and the card are each written once, and the gateway never repeats a paid call.
   */
  async run(runId: string): Promise<void> {
    const ctx = await this.observe(runId);
    if (!ctx) return;
    await this.db.update(run).set({ status: 'running' }).where(eq(run.id, runId));
    try {
      await this.loop(ctx);
    } catch (error) {
      await this.finish(ctx, 'failed', 'stopped_error');
      throw error;
    }
  }

  // ---- observe ----

  private async observe(runId: string): Promise<RunContext | undefined> {
    const [row] = await this.db
      .select({ run, snapshot, profile })
      .from(run)
      .innerJoin(snapshot, eq(snapshot.id, run.snapshotId))
      .innerJoin(profile, eq(profile.id, snapshot.profileId))
      .where(eq(run.id, runId));
    if (!row) throw new Error(`Run ${runId} does not exist`);
    if (row.run.status === 'done' || row.run.status === 'failed') return undefined;

    const photos = await this.db.select().from(photo).where(eq(photo.snapshotId, row.snapshot.id));
    const [report] = await this.db.select().from(selfReport).where(eq(selfReport.snapshotId, row.snapshot.id));
    const trace = new TraceWriter(this.db, runId);
    await trace.reset();
    const ctx: RunContext = {
      run: row.run,
      snapshot: row.snapshot,
      profile: row.profile,
      template: templates[templateKeySchema.parse(row.profile.templateKey)],
      photos: new Map(photos.map((p) => [p.kind, { objectKey: p.objectKey, sha256: p.sha256, expiresAt: p.expiresAt }])),
      report: report ? { changed: report.changed, reportedSize: sizeSchema.nullable().parse(report.reportedSize) } : undefined,
      trace,
      blocked: new Set(),
      remaining: 0,
      stopReason: 'stopped_complete',
      retake: undefined,
    };
    ctx.remaining = await this.ledger.remaining(this.budgetOf(ctx));
    await trace.add('observe', 'observed');
    return ctx;
  }

  // ---- the loop ----

  private async loop(ctx: RunContext): Promise<void> {
    const history = await this.history(ctx);

    const fatal = await this.measure(ctx, history);
    if (fatal) return this.end(ctx, fatal);

    const readings = await this.readings(ctx);
    const placed = await this.place(ctx, history, readings);

    const hasDensity = readings.some((r) => r.tool === 'hair_density' && r.reliable);
    const facts = this.facts(ctx, readings, history.baselineSnapshotId);
    const plan = await this.decide(ctx, placed.stageKey, history.previousStage, facts, hasDensity);

    const act = await this.act(ctx, plan.strategy, hasDensity);
    if (act.fatal) return this.end(ctx, act.fatal);

    if (ctx.retake && act.options.length === 0 && facts.every((f) => f.tool === 'self_report')) {
      await ctx.trace.add('stop', 'stopped_retake');
      await this.db.update(run).set({ retake: ctx.retake }).where(eq(run.id, ctx.run.id));
      return this.finish(ctx, 'failed', 'stopped_retake');
    }
    await this.compose(ctx, placed.stageKey, history.previousStage, facts, plan, act.options);
  }

  // ---- what is already known ----

  private async history(ctx: RunContext): Promise<History> {
    const snaps = await this.db
      .select({ id: snapshot.id, isBaseline: snapshot.isBaseline, stageKey: snapshot.stageKey })
      .from(snapshot)
      .where(eq(snapshot.profileId, ctx.profile.id))
      .orderBy(asc(snapshot.takenAt), asc(snapshot.id));
    const before = snaps.slice(0, snaps.findIndex((s) => s.id === ctx.snapshot.id));

    const measured = new Set(
      (
        await this.db
          .select({ snapshotId: measurement.snapshotId })
          .from(measurement)
          .innerJoin(snapshot, eq(snapshot.id, measurement.snapshotId))
          .where(eq(snapshot.profileId, ctx.profile.id))
      ).map((r) => r.snapshotId),
    );
    let checkInsSinceMeasured = 1;
    for (const s of [...before].reverse()) {
      if (measured.has(s.id)) break;
      checkInsSinceMeasured++;
    }

    const reports = await this.db
      .select({ snapshotId: selfReport.snapshotId, size: selfReport.reportedSize })
      .from(selfReport)
      .innerJoin(snapshot, eq(snapshot.id, selfReport.snapshotId))
      .where(eq(snapshot.profileId, ctx.profile.id))
      .orderBy(asc(snapshot.takenAt), asc(snapshot.id));
    const sizes = reports.flatMap((r) => (r.size ? [{ snapshotId: r.snapshotId, size: sizeSchema.parse(r.size) }] : []));
    const previous = before.at(-1);

    return {
      previousStage: [...before].reverse().find((s) => s.stageKey)?.stageKey ?? null,
      baselineSnapshotId: snaps.find((s) => s.isBaseline)?.id ?? null,
      checkInsSinceMeasured,
      // The first size a person reports is the one later sizes are counted from.
      baselineSize: sizes[0]?.size,
      previousSize: sizes.find((s) => s.snapshotId === previous?.id)?.size,
    };
  }

  private async readings(ctx: RunContext): Promise<Reading[]> {
    const rows = await this.db
      .select({ m: measurement })
      .from(measurement)
      .innerJoin(snapshot, eq(snapshot.id, measurement.snapshotId))
      .where(eq(snapshot.profileId, ctx.profile.id))
      .orderBy(asc(measurement.createdAt));
    return rows.map(({ m }) => ({
      id: m.id,
      snapshotId: m.snapshotId,
      tool: measureToolSchema.parse(m.tool),
      value: measuredValueSchema.parse(m.value),
      reliable: m.reliable,
      at: m.createdAt,
    }));
  }

  /** The newest reliable reading of each tool, and what the person reported, named for the planner. */
  private facts(ctx: RunContext, readings: Reading[], baselineSnapshotId: string | null): Fact[] {
    const facts: Fact[] = [];
    for (const tool of factOrder) {
      const sameTool = readings.filter((r) => r.tool === tool && r.reliable);
      const latest = sameTool.at(-1);
      if (!latest) continue;
      const base = sameTool.find((r) => r.snapshotId === baselineSnapshotId) ?? sameTool[0];
      facts.push({
        ref: `m${facts.length + 1}`,
        tool,
        value: latest.value,
        measurementId: latest.id,
        measuredAt: latest.at,
        current: latest.snapshotId === ctx.snapshot.id,
        direction:
          latest.value.kind === 'density' && base?.value.kind === 'density'
            ? densityDirection(base.value.mapping, latest.value.mapping)
            : undefined,
      });
    }
    if (ctx.report) {
      facts.push(reportedChange(ctx.report.changed, ctx.snapshot.takenAt));
      if (ctx.report.reportedSize) {
        facts.push({
          ref: 'r2',
          tool: 'self_report',
          value: { kind: 'reported_size', size: ctx.report.reportedSize },
          measurementId: null,
          measuredAt: ctx.snapshot.takenAt,
          current: true,
        });
      }
    }
    return facts;
  }

  // ---- measure ----

  private async measure(ctx: RunContext, history: History): Promise<Fatal | undefined> {
    const due = measurementsDue({
      isBaseline: ctx.snapshot.isBaseline,
      tracks: ctx.template.tracks,
      photos: new Set(ctx.photos.keys()),
      headCovering: ctx.profile.headCovering,
      changed: ctx.report?.changed,
      stageExpectsChange: history.previousStage !== ctx.template.stages.at(-1),
      checkInsSinceMeasured: history.checkInsSinceMeasured,
      remeasureEvery: ctx.template.remeasureEvery,
    });
    if (due.length === 0) {
      await ctx.trace.add('measure', 'not_due');
      return undefined;
    }

    for (const tool of due) {
      const cost = priceOf(tool);
      const eligible = toolEligibility(tool, cost, this.eligibility(ctx, false));
      if (!eligible.allowed) {
        await this.noteBlocked(ctx, 'measure', tool, eligible.reason);
        continue;
      }
      const outcome = await this.takeMeasurement(ctx, tool);
      if (outcome.kind === 'value') {
        await this.db
          .insert(measurement)
          .values({
            snapshotId: ctx.snapshot.id,
            tool,
            value: outcome.value,
            reliable: outcome.reliable,
            youcamTaskId: outcome.taskId,
          })
          .onConflictDoNothing();
        await ctx.trace.add('measure', outcome.reused ? 'reused' : 'measured', { tool, costUnits: outcome.units });
        ctx.remaining = await this.ledger.remaining(this.budgetOf(ctx));
        continue;
      }
      const fatal = await this.handleFailure(ctx, 'measure', tool, outcome);
      if (fatal) return fatal;
    }
    return undefined;
  }

  private takeMeasurement(ctx: RunContext, tool: MeasureTool): Promise<Measured> {
    const call = (kinds: PhotoKind[]) => this.callContext(ctx, kinds);
    switch (tool) {
      case 'hair_density':
        return this.gateway.measure(call(['top']), 'hair_density', {}, srcFile).then((o) =>
          o.kind !== 'result'
            ? o
            : valued(o, { kind: 'density', term: o.result.hair_density.term, mapping: Number(o.result.hair_density.mapping) }, true),
        );
      case 'hair_length':
        return this.gateway
          .measure(call(['front']), 'hair_length', {}, srcFile)
          .then((o) => (o.kind !== 'result' ? o : valued(o, { kind: 'length', term: o.result.hair_length.term }, true)));
      case 'hair_type':
        return this.gateway
          .measure(call(['front', 'right', 'left']), 'hair_type', {}, (ids) => ({
            src_file_ids: [ids[0] ?? '', ids[1] ?? '', ids[2] ?? ''],
          }))
          .then((o) => (o.kind !== 'result' ? o : valued(o, { kind: 'hair_type', term: o.result.hair_type.mapping }, true)));
      case 'face_shape':
        return this.gateway
          .measure(call(['front']), 'face_shape', { features: 'faceShape,faceAspectRatio', strictness: 'flexible' }, (ids) => ({
            src_file_id: ids[0] ?? '',
            features: ['faceShape', 'faceAspectRatio'],
            face_angle_strictness_level: 'flexible',
          }))
          .then((o): Measured => {
            if (o.kind !== 'result') return o;
            const ratio = o.result.facialratio?.face_aspect_ratio[1];
            // Without the ratio there is nothing to track, and the call has already been paid for.
            if (ratio === undefined) return { kind: 'blocked', reason: 'blocked_tool' };
            return valued(o, { kind: 'face_ratio', ratio }, isReliable(o.result.face_quality));
          });
      case 'skin_tone':
        return this.gateway
          .measure(call(['front']), 'skin_tone', { strictness: 'flexible' }, (ids) => ({
            src_file_id: ids[0] ?? '',
            face_angle_strictness_level: 'flexible',
          }))
          .then((o) =>
            o.kind !== 'result' ? o : valued(o, { kind: 'skin_colour', hex: o.result.color.skin_color }, isReliable(o.result.face_quality)),
          );
    }
  }

  // ---- place ----

  private async place(ctx: RunContext, history: History, readings: Reading[]) {
    const reliable = (tool: MeasureTool) => readings.filter((r) => r.tool === tool && r.reliable);
    const densities = reliable('hair_density').flatMap((r) => (r.value.kind === 'density' ? [{ ...r, mapping: r.value.mapping }] : []));
    const baselineDensity = densities.find((d) => d.snapshotId === history.baselineSnapshotId) ?? densities[0];
    const skins = reliable('skin_tone').flatMap((r) => (r.value.kind === 'skin_colour' ? [{ ...r, hex: r.value.hex }] : []));
    const baselineSkin = skins.find((s) => s.snapshotId === history.baselineSnapshotId) ?? skins[0];
    const length = reliable('hair_length').at(-1);
    const latestSkin = skins.at(-1);

    const placed = placeStage(ctx.template.placement, {
      stages: ctx.template.stages,
      previousStage: history.previousStage,
      baseline: {
        density: baselineDensity?.mapping,
        skinLuma: baselineSkin ? luma(baselineSkin.hex) : undefined,
        size: history.baselineSize,
      },
      latest: {
        density: densities.at(-1)?.mapping,
        lowestDensity: densities.length > 0 ? Math.min(...densities.map((d) => d.mapping)) : undefined,
        lengthTerm: length?.value.kind === 'length' ? length.value.term : undefined,
        skinLuma: latestSkin ? luma(latestSkin.hex) : undefined,
        size: ctx.report?.reportedSize ?? undefined,
        changed: ctx.report?.changed,
      },
      previousSize: history.previousSize,
    });
    await this.db.update(snapshot).set({ stageKey: placed.stageKey }).where(eq(snapshot.id, ctx.snapshot.id));
    const reason: Record<typeof placed.basis, TraceReason> = {
      baseline: 'placed_baseline',
      measured: 'placed_measured',
      reported: 'placed_reported',
      previous: 'placed_previous',
    };
    await ctx.trace.add('place', reason[placed.basis]);
    if (history.previousStage && placed.stageKey !== history.previousStage) await ctx.trace.add('place', 'stage_changed');
    return placed;
  }

  // ---- decide ----

  private async decide(ctx: RunContext, stage: string, previousStage: string | null, facts: Fact[], hasDensity: boolean) {
    const eligibility = this.eligibility(ctx, hasDensity);
    const listed = ctx.template.strategies[stage] ?? [];
    const usable = listed.filter(
      (s) =>
        s === 'hold' ||
        strategyTools(s, ctx.template.key).some((tool) => toolEligibility(tool, priceOf(tool), eligibility).allowed),
    );
    // Holding is always possible: it renders nothing and spends nothing.
    const strategies: Strategy[] = usable.includes('hold') ? usable : [...usable, 'hold'];

    const input: PlannerInput = {
      templateKey: ctx.template.key,
      stage,
      previousStage,
      facts: facts.map((f) => this.plannerFact(f)),
      moment: ctx.snapshot.moment,
      tone: ctx.profile.tone,
      locale: liveLocaleSchema.parse(ctx.profile.locale),
      strategies,
    };
    const plan = facts.length === 0 ? this.planner.fixedPlan(input) : await this.planner.plan(input);
    // The citation is what the choice rests on, kept so the decision can be audited (spec section 8, step 4).
    await ctx.trace.add('decide', plan.source === 'fallback' ? 'planner_fallback' : 'strategy_chosen', {
      inputs: { strategy: plan.strategy, citation: plan.citation },
    });
    return plan;
  }

  private plannerFact(fact: Fact): PlannerFact {
    const hasWords =
      fact.value.kind === 'density' ||
      fact.value.kind === 'length' ||
      fact.value.kind === 'reported_change' ||
      fact.value.kind === 'reported_size';
    return {
      ref: fact.ref,
      about: factAbout[fact.tool],
      term: hasWords ? factText(fact, 'en') : null,
      direction: fact.direction ?? null,
    };
  }

  // ---- act ----

  private async act(ctx: RunContext, chosen: Strategy, hasDensity: boolean) {
    const options: StageCard['options'] = [];
    let fatal: Fatal | undefined;
    const front = ctx.photos.get('front');

    // The chosen strategy, then brow makeup when hair transfer or hair volume could not be used,
    // then earlier looks (spec section 7, rule 6).
    const attempts: { strategy: Strategy; tools?: readonly RenderTool[] }[] =
      chosen === 'cut' || chosen === 'volume'
        ? [{ strategy: chosen }, { strategy: 'colour', tools: hairTransferFallback }]
        : [{ strategy: chosen }];
    let failures = 0;
    let rendered = 0;
    for (const { strategy, tools } of attempts) {
      if (strategy === 'hold' || !front || fatal || ctx.retake) break;
      const made = await this.renderStrategy(ctx, strategy, hasDensity, MAX_RENDERS - rendered, options, tools);
      fatal = made.fatal;
      rendered += made.count;
      if (made.count > 0) break;
      if (++failures >= 2) {
        ctx.stopReason = 'stopped_ineligible';
        await ctx.trace.add('act', 'stopped_ineligible');
        break;
      }
    }

    if (options.length === 0 && !fatal) await this.addEarlierLooks(ctx, options);
    return { options, fatal };
  }

  private async renderStrategy(
    ctx: RunContext,
    strategy: Strategy,
    hasDensity: boolean,
    room: number,
    options: StageCard['options'],
    only?: readonly RenderTool[],
  ): Promise<{ count: number; fatal?: Fatal }> {
    const front = ctx.photos.get('front');
    if (!front) return { count: 0 };
    let count = 0;
    const noted = new Set<string>();
    for (const look of looksByStrategy[strategy]) {
      if (count >= room || ctx.retake) break;
      const tool = look.tool;
      if (!strategyTools(strategy, ctx.template.key).includes(tool) || (only && !only.includes(tool))) continue;

      const inputHash = createHash('sha256').update(`${front.sha256}:${look.id}`).digest('hex');
      const [existing] = await this.db
        .select({ id: render.id })
        .from(render)
        .where(and(eq(render.snapshotId, ctx.snapshot.id), eq(render.inputHash, inputHash)));
      if (existing) {
        options.push({ renderId: existing.id, tool, strategy, label: 'preview' });
        count++;
        continue;
      }

      const eligible = toolEligibility(tool, priceOf(tool), { ...this.eligibility(ctx, hasDensity), remainingUnits: ctx.remaining });
      if (!eligible.allowed) {
        // The rest of this tool's looks are blocked the same way, so it is noted once.
        if (!noted.has(tool)) await this.noteBlocked(ctx, 'act', tool, eligible.reason);
        noted.add(tool);
        continue;
      }

      const renderId = randomUUID();
      const imageKey = `renders/${ctx.profile.id}/${ctx.snapshot.id}/${renderId}.jpg`;
      const [params, body] = renderRequest(look);
      const outcome = await this.gateway.render(this.callContext(ctx, ['front']), tool, imageKey, params, body);
      if (outcome.kind === 'image') {
        await this.db.insert(render).values({
          id: renderId,
          snapshotId: ctx.snapshot.id,
          tool,
          strategy,
          inputHash,
          objectKey: outcome.objectKey,
          label: 'preview',
          expiresAt: expiresAt(ctx.profile.retention, ctx.snapshot.takenAt),
        });
        options.push({ renderId, tool, strategy, label: 'preview' });
        count++;
        await ctx.trace.add('act', outcome.reused ? 'reused' : 'rendered', { tool, costUnits: outcome.units });
        ctx.remaining = await this.ledger.remaining(this.budgetOf(ctx));
        continue;
      }
      const fatal = await this.handleFailure(ctx, 'act', tool, outcome);
      if (fatal) return { count, fatal };
      // A blocked tool is blocked for every look it makes.
      if (outcome.kind === 'blocked') ctx.blocked.add(tool);
    }
    return { count };
  }

  /** Renders from earlier check ins that are still stored, shown as earlier looks (spec section 7, rule 6). */
  private async addEarlierLooks(ctx: RunContext, options: StageCard['options']): Promise<void> {
    const earlier = await this.db
      .select({ id: render.id, tool: render.tool, strategy: render.strategy, objectKey: render.objectKey })
      .from(render)
      .innerJoin(snapshot, eq(snapshot.id, render.snapshotId))
      .where(and(eq(snapshot.profileId, ctx.profile.id), ne(render.snapshotId, ctx.snapshot.id)))
      .orderBy(desc(snapshot.takenAt))
      .limit(10);
    const kept = earlier.filter((r) => r.objectKey !== null).slice(0, MAX_EARLIER_LOOKS);
    for (const r of kept) options.push({ renderId: r.id, tool: r.tool, strategy: r.strategy, label: 'earlier_look' });
    if (kept.length > 0) await ctx.trace.add('act', 'earlier_look');
  }

  // ---- compose ----

  private async compose(
    ctx: RunContext,
    stageKey: string,
    previousStage: string | null,
    facts: Fact[],
    plan: { strategy: Strategy; citation: string; note: string; source: 'model' | 'fixture' | 'fallback' },
    options: StageCard['options'],
  ): Promise<void> {
    const locale = liveLocaleSchema.parse(ctx.profile.locale);
    const note = plan.note.replace(/\{m:([^{}]*)\}/g, (_, ref: string) => {
      const fact = facts.find((f) => f.ref === ref);
      if (!fact) throw new Error(`Planner text names an unknown fact: ${ref}`);
      return factText(fact, locale);
    });
    await ctx.trace.add('compose', plan.source === 'fallback' ? 'note_fallback' : 'composed');
    await ctx.trace.add('stop', ctx.stopReason);

    const card: StageCard = {
      templateKey: ctx.template.key,
      stageKey,
      previousStageKey: previousStage,
      locale,
      takenAt: ctx.snapshot.takenAt.toISOString(),
      companionNote: { text: note, tone: ctx.profile.tone, moment: ctx.snapshot.moment, fixed: plan.source === 'fallback' },
      changes: facts.map((f) => ({
        tool: f.tool,
        measurementId: f.measurementId,
        value: f.value,
        measuredAt: f.measuredAt.toISOString(),
        current: f.current,
      })),
      options,
      holdOffBuying: [],
      whatToSay: ctx.snapshot.moment ? messages[locale].whatToSay[ctx.snapshot.moment] : [],
      trace: await ctx.trace.lines(),
      sensitive: ctx.template.sensitive,
    };
    await this.db
      .insert(stageCard)
      .values({ runId: ctx.run.id, profileId: ctx.profile.id, card })
      .onConflictDoNothing();
    if (ctx.retake) await this.db.update(run).set({ retake: ctx.retake }).where(eq(run.id, ctx.run.id));
    await this.finish(ctx, 'done', ctx.stopReason);
  }

  // ---- shared ----

  private async handleFailure(ctx: RunContext, step: 'measure' | 'act', tool: string, failure: CallFailure): Promise<Fatal | undefined> {
    switch (failure.kind) {
      case 'blocked':
        await this.noteBlocked(ctx, step, tool, failure.reason);
        if (failure.reason === 'blocked_tool') ctx.blocked.add(tool);
        return undefined;
      case 'retake':
        ctx.retake = failure.problem;
        await ctx.trace.add(step, 'retake_photo', { tool });
        return undefined;
      case 'not_recorded':
      case 'stop':
        return failure;
    }
  }

  private async noteBlocked(ctx: RunContext, step: 'measure' | 'act', tool: string, reason: TraceReason) {
    if (reason === 'blocked_budget') ctx.stopReason = 'stopped_budget';
    await ctx.trace.add(step, reason, { tool });
  }

  private async end(ctx: RunContext, fatal: Fatal): Promise<void> {
    const reason: TraceReason = fatal.kind === 'not_recorded' ? 'not_recorded' : fatal.reason;
    await ctx.trace.add('stop', reason);
    await this.finish(ctx, 'failed', reason);
  }

  private async finish(ctx: RunContext, status: 'done' | 'failed', reason: TraceReason): Promise<void> {
    await this.db.update(run).set({ status, stopReason: reason }).where(eq(run.id, ctx.run.id));
  }

  private eligibility(ctx: RunContext, hasDensity: boolean) {
    return {
      templateKey: ctx.template.key,
      headCovering: ctx.profile.headCovering,
      hasDensity,
      blockedTools: ctx.blocked,
      remainingUnits: ctx.remaining,
    };
  }

  private budgetOf(ctx: RunContext) {
    return {
      profileId: ctx.profile.id,
      runId: ctx.run.id,
      runBudgetUnits: ctx.run.budgetUnits,
      sourceHash: ctx.run.sourceHash ?? undefined,
    };
  }

  private callContext(ctx: RunContext, kinds: PhotoKind[]): CallContext {
    return {
      ...this.budgetOf(ctx),
      photos: kinds.map((kind) => {
        const stored = ctx.photos.get(kind);
        if (!stored) throw new Error(`Snapshot ${ctx.snapshot.id} has no ${kind} photo`);
        return { objectKey: stored.objectKey, sha256: stored.sha256 };
      }),
    };
  }
}

interface History {
  previousStage: string | null;
  baselineSnapshotId: string | null;
  checkInsSinceMeasured: number;
  baselineSize: Size | undefined;
  previousSize: Size | undefined;
}

const measureToolSchema = z.enum(measureTools);

function priceOf(tool: MeasureTool | RenderTool): number {
  const price = unitCosts[tool];
  if (price === null || price === undefined) throw new Error(`No confirmed price for ${tool}`);
  return price;
}

function valued<R extends { taskId: string | null; units: number; reused: boolean }>(
  outcome: R,
  value: MeasuredValue,
  reliable: boolean,
): Measured {
  return { kind: 'value', value, reliable, taskId: outcome.taskId, units: outcome.units, reused: outcome.reused };
}

/** The parameters that name a render, and the function that builds its request from the uploaded file ids. */
function renderRequest(look: Look): [Record<string, string>, (ids: string[]) => ToolRequest<RenderTool>] {
  const params = { look: look.id };
  switch (look.tool) {
    case 'hairstyle':
      return [params, (ids) => ({ src_file_id: ids[0] ?? '', template_id: look.templateId, hair_color: 'src' })];
    case 'hair_volume':
      return [params, (ids) => ({ src_file_id: ids[0] ?? '', template_id: look.templateId })];
    case 'hair_color':
      return [params, (ids) => ({ src_file_id: ids[0] ?? '', preset: look.preset })];
    case 'makeup_brows':
      return [
        params,
        (ids) => ({
          src_file_id: ids[0] ?? '',
          effects: [
            {
              category: 'eyebrows',
              pattern: { type: 'color' },
              palettes: [{ color: look.color, colorIntensity: BROW_INTENSITY, texture: 'matte' }],
            },
          ],
        }),
      ];
  }
}

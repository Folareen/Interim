import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  type Db,
  budgetCounter,
  callCache,
  ledgerEntry,
  measurement,
  photo,
  profile,
  render,
  run,
  selfReport,
  snapshot,
  stageCard,
  traceEntry,
} from '@interim/db';
import { messages } from '@interim/templates';
import { type Moment, type PhotoKind, type StageCard, stageCardSchema } from '@interim/types';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../ledger/ledger.service';
import type { ProfilesService } from '../profiles/profiles.service';
import { MemoryStorage } from '../test/memory-storage';
import { texturedJpeg } from '../test/photos';
import { createTestDb } from '../test/test-db';
import { writeYoucamFixture } from '../test/youcam-fixtures';
import { YoucamClient } from '../youcam/youcam.client';
import { YoucamGateway, youcamFixtureKey } from '../youcam/youcam.gateway';
import type { ToolName } from '../youcam/youcam.tools';
import { AgentService } from './agent.service';
import { type GenerateText, Planner, type PlannerConfig } from './planner';

const goodFace = { has_face: true, area: 'good', frontal: 'good', lighting: 'good', faceangle: 'good' };
const results = {
  hair_type: { hair_type: { mapping: '3a to 3b', term: 'Wavy' } },
  hair_density: (mapping: string, term: string) => ({ hair_density: { mapping, term } }),
  hair_length: { hair_length: { term: 'ear length' } },
  face_shape: { faceshape: 'Oval', facialratio: { face_aspect_ratio: [1, 1.34] }, face_quality: goodFace },
  skin_tone: { color: { skin_color: '#674935' }, face_quality: goodFace },
  image: { url: 'https://example.test/render.jpg' },
};
const note = 'Your hair looks {m:m1} today. That is common at this stage. Try a soft part for your first day.';

let db: Db;
let dir: string;
let storage: MemoryStorage;
let agent: AgentService;
let answer: () => string;
let image: Buffer;
let photoBytes: Buffer;
let order = 0;

beforeAll(async () => {
  db = await createTestDb();
  image = await texturedJpeg(120, 120);
  photoBytes = await texturedJpeg();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile, budget_counter, ledger_entry cascade`);
  dir = await mkdtemp(path.join(tmpdir(), 'agent-'));
  storage = new MemoryStorage();
  const client = new YoucamClient({ apiKey: '', baseUrl: 'https://youcam.test', mode: 'replay', liveCallsEnabled: false, fixturesDir: dir, retryBaseMs: 0 });
  const ledger = new LedgerService(db, { perProfile: 500, perDay: 2000, perSourcePerDay: 100 }, {} as ProfilesService);
  const gateway = new YoucamGateway(db, client, storage.asService(), ledger, { firstPollMs: 0, maxPollMs: 0, timeoutMs: 1000 });
  answer = () => JSON.stringify({ strategy: 'cut', citation: 'm1', note });
  const generate: GenerateText = () => Promise.resolve(answer());
  const config: PlannerConfig = { mode: 'live', fixturesDir: path.join(dir, 'planner'), canCallModel: true };
  agent = new AgentService(db, gateway, ledger, new Planner(config, generate));
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => rm(dir, { recursive: true, force: true }));

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

interface Seeded {
  profileId: string;
  snapshotId: string;
  runId: string;
  sha: Record<string, string>;
}

/** A profile with its first snapshot, or another snapshot of an existing profile. */
async function seed(opts: {
  profileId?: string;
  templateKey?: 'hair_loss_ahead' | 'weight_change' | 'beard_growth';
  headCovering?: boolean;
  baseline?: boolean;
  kinds: PhotoKind[];
  report?: { changed: 'none' | 'some' | 'lot'; reportedSize?: 'M' | 'L' };
  moment?: Moment;
}): Promise<Seeded> {
  const profileId = opts.profileId ?? randomUUID();
  if (!opts.profileId) {
    await db.insert(profile).values({
      id: profileId,
      templateKey: opts.templateKey ?? 'hair_loss_ahead',
      ownerRef: 'o',
      consentVersion: '3',
      consentedAt: new Date(),
      headCovering: opts.headCovering ?? false,
    });
  }
  const snapshotId = randomUUID();
  await db.insert(snapshot).values({
    id: snapshotId,
    profileId,
    isBaseline: opts.baseline ?? true,
    moment: opts.moment ?? null,
    takenAt: new Date(Date.UTC(2026, 9, 1 + order++)),
  });
  const hashes: Record<string, string> = {};
  for (const kind of opts.kinds) {
    hashes[kind] = sha(`${snapshotId}:${kind}`);
    const objectKey = `photos/${profileId}/${snapshotId}/${kind}.jpg`;
    await storage.put(objectKey, photoBytes);
    await db.insert(photo).values({ snapshotId, kind, objectKey, sha256: hashes[kind], expiresAt: new Date(Date.now() + 86_400_000) });
  }
  if (opts.report) await db.insert(selfReport).values({ snapshotId, changed: opts.report.changed, reportedSize: opts.report.reportedSize ?? null });
  const runId = randomUUID();
  await db.insert(run).values({ id: runId, snapshotId, templateKey: opts.templateKey ?? 'hair_loss_ahead', templateVersion: 1, budgetUnits: 50 });
  return { profileId, snapshotId, runId, sha: hashes };
}

const record = (tool: ToolName, shas: string[], params: Record<string, string | number | boolean>, results: unknown, withImage = false) =>
  writeYoucamFixture(dir, tool, youcamFixtureKey(shas, tool, params), { results }, withImage ? image : undefined);
const recordError = (tool: ToolName, shas: string[], params: Record<string, string | number | boolean>, error: string) =>
  writeYoucamFixture(dir, tool, youcamFixtureKey(shas, tool, params), { error });

const faceParams = { features: 'faceShape,faceAspectRatio', strictness: 'flexible' };
const skinParams = { strictness: 'flexible' };

/** Records every measurement a baseline takes, for a seeded snapshot with front, left, right and top photos. */
async function recordBaseline(s: Seeded, density = ['2.50', 'High Density']) {
  const [front = '', left = '', right = '', top = ''] = [s.sha.front, s.sha.left, s.sha.right, s.sha.top];
  await record('hair_type', [front, right, left], {}, results.hair_type);
  await record('hair_density', [top], {}, results.hair_density(density[0] ?? '', density[1] ?? ''));
  await record('hair_length', [front], {}, results.hair_length);
  await record('face_shape', [front], faceParams, results.face_shape);
  await record('skin_tone', [front], skinParams, results.skin_tone);
}
const recordLooks = (front: string, tool: 'hairstyle' | 'makeup_brows' | 'hair_volume' | 'beard_style', looks: string[]) =>
  Promise.all(looks.map((look) => record(tool, [front], { look }, results.image, true)));

const cardOf = async (runId: string): Promise<StageCard> => {
  const [row] = await db.select().from(stageCard).where(eq(stageCard.runId, runId));
  if (!row) throw new Error('No card');
  return stageCardSchema.parse(row.card);
};
const runOf = async (runId: string) => (await db.select().from(run).where(eq(run.id, runId)))[0];
const traceReasons = async (runId: string) => (await db.select().from(traceEntry).where(eq(traceEntry.runId, runId)).orderBy(traceEntry.seq)).map((t) => t.reason);

describe('baseline run', () => {
  it('measures, places the first stage, renders previews and writes a card in replay, spending nothing', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'], moment: 'back_to_work' });
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);
    const fetch = vi.spyOn(globalThis, 'fetch');

    await agent.run(s.runId);

    expect(fetch).not.toHaveBeenCalled();
    expect(await runOf(s.runId)).toMatchObject({ status: 'done', stopReason: 'stopped_complete' });
    expect((await db.select().from(measurement)).map((m) => m.tool).sort()).toEqual(['face_shape', 'hair_density', 'hair_length', 'hair_type', 'skin_tone']);
    expect((await db.select().from(snapshot).where(eq(snapshot.id, s.snapshotId)))[0]?.stageKey).toBe('full');

    const card = await cardOf(s.runId);
    expect(card).toMatchObject({ stageKey: 'full', previousStageKey: null, templateKey: 'hair_loss_ahead', sensitive: true, locale: 'en' });
    expect(card.options).toHaveLength(2);
    expect(card.options.every((o) => o.label === 'preview' && o.strategy === 'cut')).toBe(true);
    for (const option of card.options) {
      const [row] = await db.select().from(render).where(eq(render.id, option.renderId));
      expect(row?.objectKey && storage.objects.has(row.objectKey)).toBe(true);
    }
    expect(card.companionNote).toMatchObject({ tone: 'warm', moment: 'back_to_work', fixed: false });
    expect(card.whatToSay).toEqual(messages.en.whatToSay.back_to_work);

    const [settled] = await db.select().from(budgetCounter).where(eq(budgetCounter.scope, `run:${s.runId}`));
    expect(settled).toMatchObject({ reservedUnits: 0, settledUnits: 0 });
    // The one preview that was never recorded reserved and released, so it spent nothing.
    expect((await db.select().from(ledgerEntry)).filter((e) => e.kind === 'settle').every((e) => e.units === 0)).toBe(true);
  });

  it('puts every figure on the card there from a record, never from the model (acceptance 4)', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);

    await agent.run(s.runId);
    const card = await cardOf(s.runId);

    // The note's one placeholder became a term from the density record, and the model wrote no digit.
    expect(card.companionNote.text).toContain('high density');
    expect(card.companionNote.text).not.toMatch(/\d|\{|\}/);
    const rows = await db.select().from(measurement);
    for (const change of card.changes.filter((c) => c.measurementId)) {
      const row = rows.find((r) => r.id === change.measurementId);
      expect(row?.value, change.tool).toEqual(change.value);
      expect(new Date(change.measuredAt).getTime()).toBe(row?.createdAt.getTime());
    }
    expect(card.changes.find((c) => c.tool === 'face_shape')?.value).toEqual({ kind: 'face_ratio', ratio: 1.34 });
  });

  it('writes a trace line for each step, with the citation behind the choice', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);
    await agent.run(s.runId);

    const reasons = await traceReasons(s.runId);
    expect(reasons[0]).toBe('observed');
    expect(reasons).toContain('placed_baseline');
    expect(reasons).toContain('strategy_chosen');
    expect(reasons.at(-1)).toBe('stopped_complete');
    const [decide] = await db.select().from(traceEntry).where(eq(traceEntry.step, 'decide'));
    expect(decide?.inputs).toEqual({ strategy: 'cut', citation: 'm1' });
    expect((await cardOf(s.runId)).trace.map((t) => t.reason)).toEqual(reasons);
  });
});

describe('check in', () => {
  it('compares with the person’s own baseline, places the new stage and records the change', async () => {
    const base = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(base);
    await recordLooks(base.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);
    await agent.run(base.runId);

    const next = await seed({ profileId: base.profileId, baseline: false, kinds: ['front', 'top'], report: { changed: 'some' } });
    await record('hair_density', [next.sha.top ?? ''], {}, results.hair_density('1.20', 'Low Density'));
    await record('hair_length', [next.sha.front ?? ''], {}, results.hair_length);
    await recordLooks(next.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);
    await agent.run(next.runId);

    const card = await cardOf(next.runId);
    expect(card).toMatchObject({ stageKey: 'thinning', previousStageKey: 'full' });
    expect(await traceReasons(next.runId)).toContain('stage_changed');
    // Only the tracked tools were measured again: no hair type, face or skin colour.
    const measured = await db.select().from(measurement).where(eq(measurement.snapshotId, next.snapshotId));
    expect(measured.map((m) => m.tool).sort()).toEqual(['hair_density', 'hair_length']);
    expect(card.changes.find((c) => c.tool === 'hair_density')).toMatchObject({ current: true, value: { kind: 'density', mapping: 1.2 } });
    // Skin colour and face ratio were not measured this time, so the card dates them from the baseline.
    expect(card.changes.find((c) => c.tool === 'skin_tone')).toMatchObject({ current: false });
  });

  it('measures nothing on a quiet check in once the last stage is reached, and shows the old readings dated', async () => {
    const base = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(base);
    await recordLooks(base.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);
    await agent.run(base.runId);

    // Down, then back up: the stage model's last stage.
    for (const [changed, mapping, term] of [
      ['lot', '0.20', 'Extreme Low Density'],
      ['some', '1.20', 'Low Density'],
    ] as const) {
      const step = await seed({ profileId: base.profileId, baseline: false, kinds: ['front', 'top'], report: { changed } });
      await record('hair_density', [step.sha.top ?? ''], {}, results.hair_density(mapping, term));
      await record('hair_length', [step.sha.front ?? ''], {}, results.hair_length);
      await recordLooks(step.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);
      await agent.run(step.runId);
    }

    const quiet = await seed({ profileId: base.profileId, baseline: false, kinds: ['front'], report: { changed: 'none' } });
    await recordLooks(quiet.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);
    await agent.run(quiet.runId);

    expect(await db.select().from(measurement).where(eq(measurement.snapshotId, quiet.snapshotId))).toEqual([]);
    expect(await traceReasons(quiet.runId)).toContain('not_due');
    const card = await cardOf(quiet.runId);
    expect(card).toMatchObject({ stageKey: 'growing_in', previousStageKey: 'growing_in' });
    expect(card.changes.find((c) => c.tool === 'hair_density')).toMatchObject({ current: false });
  });
});

describe('beard template', () => {
  it('previews beard styles, which no other template offers', async () => {
    const s = await seed({ templateKey: 'beard_growth', kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'beard_style', ['beard_goatee', 'beard_circle', 'beard_anchor']);

    await agent.run(s.runId);

    const card = await cardOf(s.runId);
    expect(card.options.map((o) => o.tool)).toEqual(['beard_style', 'beard_style', 'beard_style']);
    expect(card.stageKey).toBe('clean');
  });

  it('keeps beard styles out of every other template', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob', 'style_buzz_cut']);
    await agent.run(s.runId);
    expect((await cardOf(s.runId)).options.map((o) => o.tool)).toEqual(['hairstyle', 'hairstyle', 'hairstyle']);
  });
});

describe('what is allowed', () => {
  it('never offers hair try on or hair measures when head covering is on (acceptance 10d)', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'], headCovering: true });
    await record('face_shape', [s.sha.front ?? ''], faceParams, results.face_shape);
    await record('skin_tone', [s.sha.front ?? ''], skinParams, results.skin_tone);
    await recordLooks(s.sha.front ?? '', 'makeup_brows', ['brows_soft', 'brows_deep']);
    answer = () => JSON.stringify({ strategy: 'colour', citation: 'm1', note: 'Your face ratio reads {m:m1}. That is common at this stage. Try a soft brow.' });

    await agent.run(s.runId);

    const card = await cardOf(s.runId);
    expect(card.options.map((o) => o.tool)).toEqual(['makeup_brows', 'makeup_brows']);
    expect((await db.select().from(measurement)).map((m) => m.tool).sort()).toEqual(['face_shape', 'skin_tone']);
    expect(await traceReasons(s.runId)).toContain('blocked_head_covering');
    expect(card.companionNote.text).toContain('1.34');
  });

  it('falls back to brow makeup and says why when hair transfer is blocked (acceptance 3)', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(s);
    await recordError('hairstyle', [s.sha.front ?? ''], { look: 'style_short_curly' }, 'error_hair_too_short');
    await recordLooks(s.sha.front ?? '', 'makeup_brows', ['brows_soft', 'brows_deep']);

    await agent.run(s.runId);

    const card = await cardOf(s.runId);
    expect(card.options.map((o) => o.tool)).toEqual(['makeup_brows', 'makeup_brows']);
    const [blocked] = await db.select().from(traceEntry).where(eq(traceEntry.reason, 'blocked_tool'));
    expect(blocked).toMatchObject({ tool: 'hairstyle', step: 'act' });
    expect((await db.select().from(callCache).where(eq(callCache.outcome, 'blocked')))[0]?.tool).toBe('hairstyle');
  });

  it('spends nothing when the run budget cannot cover a call, and still writes a card', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await db.update(run).set({ budgetUnits: 0 }).where(eq(run.id, s.runId));
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);

    await agent.run(s.runId);

    expect(await runOf(s.runId)).toMatchObject({ status: 'done', stopReason: 'stopped_budget' });
    expect(await db.select().from(measurement)).toEqual([]);
    expect(await db.select().from(ledgerEntry)).toEqual([]);
    expect((await cardOf(s.runId)).options).toEqual([]);
    expect(await traceReasons(s.runId)).toContain('blocked_budget');
  });
});

describe('when something is missing', () => {
  it('fails closed, with no card and no units held, when nothing was recorded (acceptance 6)', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    const fetch = vi.spyOn(globalThis, 'fetch');

    await agent.run(s.runId);

    expect(fetch).not.toHaveBeenCalled();
    expect(await runOf(s.runId)).toMatchObject({ status: 'failed', stopReason: 'not_recorded' });
    expect(await db.select().from(stageCard)).toEqual([]);
    expect((await db.select().from(budgetCounter).where(eq(budgetCounter.scope, `run:${s.runId}`)))[0]?.reservedUnits ?? 0).toBe(0);
    expect(await traceReasons(s.runId)).toContain('not_recorded');
  });

  it('uses the fixed text for the tone when the planner has nothing to offer (spec section 8)', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);
    answer = () => JSON.stringify({ strategy: 'cut', citation: 'm1', note: 'You have 3 options today.' });

    await agent.run(s.runId);

    const card = await cardOf(s.runId);
    expect(card.companionNote).toMatchObject({ text: messages.en.companionFallback.warm, fixed: true });
    expect(await traceReasons(s.runId)).toEqual(expect.arrayContaining(['planner_fallback', 'note_fallback']));
  });
});

describe('previews that were never recorded', () => {
  it('skips them, says so once, and still writes the card from what exists', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'hairstyle', ['style_short_curly']);

    await agent.run(s.runId);

    expect(await runOf(s.runId)).toMatchObject({ status: 'done' });
    expect((await cardOf(s.runId)).options).toHaveLength(1);
    expect((await traceReasons(s.runId)).filter((r) => r === 'not_recorded')).toHaveLength(1);
  });
});

describe('delivered twice', () => {
  it('does nothing for a finished run', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob']);
    await agent.run(s.runId);
    const before = await db.select().from(ledgerEntry);

    await agent.run(s.runId);

    expect(await db.select().from(ledgerEntry)).toHaveLength(before.length);
  });

  it('picks up an interrupted run without paying, measuring or rendering twice', async () => {
    const s = await seed({ kinds: ['front', 'left', 'right', 'top'] });
    await recordBaseline(s);
    await recordLooks(s.sha.front ?? '', 'hairstyle', ['style_short_curly', 'style_blunt_bob', 'style_buzz_cut']);
    await agent.run(s.runId);
    const counts = async () => [
      (await db.select().from(ledgerEntry)).length,
      (await db.select().from(measurement)).length,
      (await db.select().from(render)).length,
      (await db.select().from(stageCard)).length,
    ];
    const before = await counts();
    await db.update(run).set({ status: 'running', stopReason: null }).where(eq(run.id, s.runId));

    await agent.run(s.runId);

    expect(await counts()).toEqual(before);
    expect(await runOf(s.runId)).toMatchObject({ status: 'done' });
  });
});

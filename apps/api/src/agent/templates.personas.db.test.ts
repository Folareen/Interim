import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type Db,
  budgetCounter,
  measurement,
  photo,
  profile,
  run,
  selfReport,
  snapshot,
  stageCard,
} from '@interim/db';
import { type StageCard, type Strategy, stageCardSchema } from '@interim/types';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../ledger/ledger.service';
import type { ProfilesService } from '../profiles/profiles.service';
import { normalisePhoto } from '../snapshots/photo';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { YoucamClient } from '../youcam/youcam.client';
import { YoucamGateway } from '../youcam/youcam.gateway';
import { AgentService } from './agent.service';
import { type GenerateText, Planner, type PlannerConfig } from './planner';

// Runs the whole agent loop in replay on the sample personas (packages/fixtures/sample), the AI edited
// photos the recorded YouCam answers belong to. Nothing here reaches the network or spends a unit. Each
// situation has to give advice only that situation would give (docs/product/spec.md section 9).

const repo = path.resolve(__dirname, '../../../..');
const fixturesDir = path.join(repo, 'packages/fixtures/youcam');
const sampleDir = path.join(repo, 'packages/fixtures/sample');

type TemplateKey = 'hair_loss_ahead' | 'hair_patches' | 'face_fullness' | 'after_surgery' | 'skin_colour';
type Persona = 'm' | 'f';

let db: Db;
let storage: MemoryStorage;
let agent: AgentService;
let planned: { strategy: Strategy; citation: string };
const photos = new Map<string, { jpeg: Buffer; sha256: string }>();
let order = 0;

const note = 'Your hair looks different today. That is common at this stage. Try something that feels easy for your first day.';

beforeAll(async () => {
  db = await createTestDb();
  for (const persona of ['m', 'f'] as const) {
    for (const stage of [0, 1, 2, 3, 4]) {
      const { jpeg, sha256 } = await normalisePhoto(await readFile(path.join(sampleDir, `persona-${persona}-stage-${stage}.jpg`)));
      photos.set(`${persona}-${stage}`, { jpeg, sha256 });
    }
  }
});

beforeEach(async () => {
  await db.execute(sql`truncate profile, budget_counter, ledger_entry cascade`);
  storage = new MemoryStorage();
  const client = new YoucamClient({ apiKey: '', baseUrl: 'https://youcam.test', mode: 'replay', liveCallsEnabled: false, fixturesDir, retryBaseMs: 0 });
  const ledger = new LedgerService(db, { perProfile: 500, perDay: 2000, perSourcePerDay: 100 }, {} as ProfilesService);
  const gateway = new YoucamGateway(db, client, storage.asService(), ledger, { firstPollMs: 0, maxPollMs: 0, timeoutMs: 1000 });
  planned = { strategy: 'hold', citation: 'm1' };
  const generate: GenerateText = () => Promise.resolve(JSON.stringify({ ...planned, note }));
  const config: PlannerConfig = { mode: 'live', fixturesDir: path.join(repo, 'packages/fixtures/planner'), canCallModel: true };
  agent = new AgentService(db, gateway, ledger, new Planner(config, generate));
});

afterEach(() => vi.restoreAllMocks());

/** One check in of a persona's front photo, run through the agent. Returns the profile so the next check in can follow. */
async function checkIn(opts: {
  templateKey: TemplateKey;
  persona: Persona;
  stage: number;
  profileId?: string;
  baseline: boolean;
  headCovering?: boolean;
  bodyPhotos?: boolean;
  report?: { changed: 'none' | 'some' | 'lot'; reportedSize?: 'M' | 'L' };
}): Promise<{ profileId: string; card: StageCard; runId: string }> {
  const profileId = opts.profileId ?? randomUUID();
  if (!opts.profileId) {
    await db.insert(profile).values({
      id: profileId,
      templateKey: opts.templateKey,
      ownerRef: 'o',
      consentVersion: '4',
      consentedAt: new Date(),
      headCovering: opts.headCovering ?? false,
      bodyPhotos: opts.bodyPhotos ?? true,
    });
  }
  const snapshotId = randomUUID();
  await db.insert(snapshot).values({ id: snapshotId, profileId, isBaseline: opts.baseline, takenAt: new Date(Date.UTC(2026, 9, 1 + order++)) });
  const front = photos.get(`${opts.persona}-${opts.stage}`);
  if (!front) throw new Error('No such persona photo');
  const objectKey = `photos/${profileId}/${snapshotId}/front.jpg`;
  await storage.put(objectKey, front.jpeg, 'image/jpeg');
  await db.insert(photo).values({ snapshotId, kind: 'front', objectKey, sha256: front.sha256, expiresAt: new Date(Date.now() + 86_400_000) });
  if (opts.report) await db.insert(selfReport).values({ snapshotId, changed: opts.report.changed, reportedSize: opts.report.reportedSize ?? null });
  const runId = randomUUID();
  await db.insert(run).values({ id: runId, snapshotId, templateKey: opts.templateKey, templateVersion: 1, budgetUnits: 50 });

  await agent.run(runId);

  const [row] = await db.select().from(stageCard).where(eq(stageCard.runId, runId));
  if (!row) throw new Error('No card');
  return { profileId, card: stageCardSchema.parse(row.card), runId };
}

const codes = (card: StageCard) => card.advice.map((line) => line.code);

describe('templates 2 to 5 on the sample personas', () => {
  it('gives the hair loss situation no advice lines, so every line below is one only another situation would give', async () => {
    planned = { strategy: 'cut', citation: 'm1' };
    const { card } = await checkIn({ templateKey: 'hair_loss_ahead', persona: 'm', stage: 0, baseline: true });
    expect(card.advice).toEqual([]);
  });

  describe('hair_patches', () => {
    it('offers a parting first, then places the stage from the person’s own report when there is no density reading', async () => {
      planned = { strategy: 'part', citation: 'm1' };
      const baseline = await checkIn({ templateKey: 'hair_patches', persona: 'f', stage: 0, baseline: true });
      expect(baseline.card.stageKey).toBe('full');
      expect(codes(baseline.card)).toEqual(['patches_part']);

      planned = { strategy: 'brow', citation: 'r1' };
      const next = await checkIn({ templateKey: 'hair_patches', persona: 'f', stage: 1, profileId: baseline.profileId, baseline: false, report: { changed: 'lot' } });
      expect(next.card.stageKey).toBe('widespread');
      expect(codes(next.card)).toEqual(['patches_own_report', 'patches_brow']);
      // The sample photos have no top view, so density was never read: only the baseline's hair length was.
      expect((await db.select().from(measurement)).map((m) => m.tool)).toEqual(['hair_length']);
    });

    it('never advises a parting to a person who covers their hair, and still gives the brow', async () => {
      // The model asks for a parting; the strategies offered for a covered head do not include one.
      planned = { strategy: 'part', citation: 'r1' };
      const { card } = await checkIn({ templateKey: 'hair_patches', persona: 'm', stage: 0, baseline: true, headCovering: true, report: { changed: 'some' } });
      expect(codes(card)).toEqual(['patches_brow']);
      expect(card.companionNote.fixed).toBe(true);
      expect(await db.select().from(measurement)).toEqual([]);
    });
  });

  describe('face_fullness', () => {
    it('measures the face aspect ratio and gives neckline advice, with a soft collar once the size is moving', async () => {
      planned = { strategy: 'neckline', citation: 'm1' };
      const baseline = await checkIn({ templateKey: 'face_fullness', persona: 'm', stage: 0, baseline: true });
      expect(baseline.card.stageKey).toBe('usual');
      expect(baseline.card.changes.map((c) => c.tool)).toContain('face_shape');
      expect(codes(baseline.card)).toEqual(['fullness_neckline']);

      const next = await checkIn({ templateKey: 'face_fullness', persona: 'm', stage: 0, profileId: baseline.profileId, baseline: false, report: { changed: 'some', reportedSize: 'L' } });
      expect(next.card.stageKey).toBe('fuller');
      expect(codes(next.card)).toEqual(['fullness_neckline', 'fullness_collar']);
      expect(next.card.changes.find((c) => c.tool === 'self_report')?.value).toEqual({ kind: 'reported_change', changed: 'some' });
    });

    it('can give the frame choice instead', async () => {
      planned = { strategy: 'frame', citation: 'm1' };
      const { card } = await checkIn({ templateKey: 'face_fullness', persona: 'f', stage: 0, baseline: true });
      expect(codes(card)).toEqual(['fullness_frame']);
    });
  });

  describe('after_surgery', () => {
    it('puts comfort first, measures nothing and says body photos are off', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      // Nothing is measured, so there is nothing to cite and the first strategy is used.
      const baseline = await checkIn({ templateKey: 'after_surgery', persona: 'm', stage: 0, baseline: true, bodyPhotos: false });
      expect(baseline.card.stageKey).toBe('recovering');
      expect(codes(baseline.card)).toEqual(['surgery_photos_off', 'surgery_soft', 'surgery_front_opening']);
      expect(baseline.card.clothes).toEqual([]);

      planned = { strategy: 'comfort', citation: 'r1' };
      const next = await checkIn({ templateKey: 'after_surgery', persona: 'm', stage: 0, profileId: baseline.profileId, baseline: false, bodyPhotos: false, report: { changed: 'some' } });
      expect(next.card.stageKey).toBe('settling');
      expect(codes(next.card)).toEqual(['surgery_photos_off', 'surgery_soft', 'surgery_relaxed_first']);
      expect(next.card.changes.map((c) => c.tool)).toEqual(['self_report']);

      expect(await db.select().from(measurement)).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
      const [spent] = await db.select().from(budgetCounter).where(eq(budgetCounter.scope, `run:${next.runId}`));
      expect(spent?.settledUnits ?? 0).toBe(0);
    });

    it('stops saying body photos are off once the person turns them on', async () => {
      const { card } = await checkIn({ templateKey: 'after_surgery', persona: 'f', stage: 0, baseline: true, bodyPhotos: true });
      expect(codes(card)).toEqual(['surgery_soft', 'surgery_front_opening']);
    });
  });

  describe('skin_colour', () => {
    it('matches colours for clothes and makeup to the recorded skin colour reading of each persona', async () => {
      planned = { strategy: 'match', citation: 'm1' };
      const man = await checkIn({ templateKey: 'skin_colour', persona: 'm', stage: 0, baseline: true });
      const woman = await checkIn({ templateKey: 'skin_colour', persona: 'f', stage: 0, baseline: true });

      for (const { card } of [man, woman]) {
        expect(card.changes.map((c) => c.tool)).toContain('skin_tone');
        expect(codes(card)).toEqual(['skin_match_clothes', 'skin_match_makeup']);
        expect(card.advice.every((line) => line.colours.length > 0)).toBe(true);
      }
      const hex = (card: StageCard) => card.changes.find((c) => c.tool === 'skin_tone')?.value;
      expect(hex(man.card)).not.toEqual(hex(woman.card));
    });

    it('asks for no body photo and shows no clothes', async () => {
      planned = { strategy: 'match', citation: 'm1' };
      const { card } = await checkIn({ templateKey: 'skin_colour', persona: 'm', stage: 0, baseline: true });
      expect(card.clothes).toEqual([]);
      expect(card.options).toEqual([]);
    });
  });

  it('keeps every card’s advice to its own situation', async () => {
    const own = {
      hair_patches: { prefix: 'patches_', strategy: 'part' },
      face_fullness: { prefix: 'fullness_', strategy: 'neckline' },
      after_surgery: { prefix: 'surgery_', strategy: 'comfort' },
      skin_colour: { prefix: 'skin_match_', strategy: 'match' },
    } as const;
    for (const templateKey of ['hair_patches', 'face_fullness', 'after_surgery', 'skin_colour'] as const) {
      planned = { strategy: own[templateKey].strategy, citation: 'm1' };
      const { card } = await checkIn({ templateKey, persona: 'm', stage: 0, baseline: true });
      expect(card.advice.length, templateKey).toBeGreaterThan(0);
      for (const code of codes(card)) expect(code.startsWith(own[templateKey].prefix), `${templateKey} ${code}`).toBe(true);
    }
  });
});

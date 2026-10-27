import { randomUUID } from 'node:crypto';
import { type Db, profile, run, snapshot, stageCard } from '@interim/db';
import type { StageCard } from '@interim/types';
import { NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RunsService } from '../runs/runs.service';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { DemoService } from './demo.service';

let db: Db;
let service: DemoService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile cascade`);
  const runs = new RunsService(db, new MemoryStorage().asService(), { enqueue: () => Promise.resolve() }, { runBudgetCap: 40 });
  service = new DemoService(db, runs);
});

const card = (takenAt: string): StageCard => ({
  templateKey: 'hair_loss_ahead',
  stageKey: 'full',
  previousStageKey: null,
  locale: 'en',
  takenAt,
  companionNote: { text: 'A note.', tone: 'warm', moment: null, fixed: true },
  changes: [],
  options: [],
  clothes: [],
  advice: [],
  shoppingList: [],
  holdOffBuying: [],
  whatToSay: [],
  trace: [],
  sensitive: true,
});

/** One profile with one card per date, oldest date first. */
async function seed(ownerRef: string, judgeSample: boolean, dates: string[]) {
  const profileId = randomUUID();
  await db.insert(profile).values({ id: profileId, templateKey: 'hair_loss_ahead', ownerRef, consentVersion: '4', consentedAt: new Date(), judgeSample });
  const cardIds: string[] = [];
  for (const date of dates) {
    const snapshotId = randomUUID();
    const runId = randomUUID();
    await db.insert(snapshot).values({ id: snapshotId, profileId, takenAt: new Date(date), stageKey: 'full' });
    await db.insert(run).values({ id: runId, snapshotId, templateKey: 'hair_loss_ahead', templateVersion: 1, budgetUnits: 40, status: 'done' });
    const [saved] = await db.insert(stageCard).values({ runId, profileId, card: card(date) }).returning({ id: stageCard.id });
    cardIds.push(saved?.id ?? '');
  }
  return { profileId, cardIds };
}

describe('list', () => {
  it('shows sample people with their cards oldest first, and nobody else', async () => {
    const sample = await seed('sample', true, ['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z']);
    await seed('account:someone', false, ['2026-10-02T00:00:00.000Z']);

    const people = await service.list();

    expect(people.map((p) => p.id)).toEqual([sample.profileId]);
    expect(people[0]?.cards.map((c) => c.takenAt)).toEqual(['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z']);
  });

  it('leaves out a profile owned by `sample` that is not flagged as a sample', async () => {
    await seed('sample', false, ['2026-10-01T00:00:00.000Z']);
    expect(await service.list()).toEqual([]);
  });
});

describe('card', () => {
  it('opens a sample card', async () => {
    const { cardIds } = await seed('sample', true, ['2026-10-01T00:00:00.000Z']);
    const view = await service.card(cardIds[0] ?? '');
    expect(view.card.takenAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('answers 404 for a real person’s card, so the demo is no way into an account', async () => {
    const { cardIds } = await seed('account:someone', false, ['2026-10-01T00:00:00.000Z']);
    await expect(service.card(cardIds[0] ?? '')).rejects.toThrow(NotFoundException);
  });
});

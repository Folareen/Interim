import { randomUUID } from 'node:crypto';
import { type Db, photo, profile, render, run, snapshot, stageCard, traceEntry } from '@interim/db';
import type { StageCard } from '@interim/types';
import { NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { firstValueFrom, toArray } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { RunsService } from './runs.service';

const alice = { ref: 'alice' };
const bob = { ref: 'bob' };

let db: Db;
let storage: MemoryStorage;
let enqueue: ReturnType<typeof vi.fn<(runId: string) => Promise<void>>>;
let service: RunsService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile cascade`);
  storage = new MemoryStorage();
  enqueue = vi.fn(() => Promise.resolve());
  service = new RunsService(db, storage.asService(), { enqueue }, { runBudgetCap: 40 });
});

async function seed(opts: { consented?: boolean; owner?: string } = {}) {
  const profileId = randomUUID();
  const snapshotId = randomUUID();
  await db.insert(profile).values({
    id: profileId,
    templateKey: 'hair_loss_ahead',
    ownerRef: opts.owner ?? alice.ref,
    consentVersion: '5',
    consentedAt: opts.consented === false ? null : new Date(),
  });
  await db
    .insert(snapshot)
    .values({ id: snapshotId, profileId, isBaseline: true, stageKey: 'full' });
  return { profileId, snapshotId };
}

const card = (renderId: string): StageCard => ({
  templateKey: 'hair_loss_ahead',
  stageKey: 'full',
  previousStageKey: null,
  locale: 'en',
  takenAt: new Date().toISOString(),
  companionNote: { text: 'A short note.', tone: 'warm', moment: null, fixed: false },
  changes: [],
  options: [{ renderId, tool: 'hairstyle', strategy: 'cut', label: 'preview' }],
  clothes: [],
  advice: [],
  shoppingList: [],
  holdOffBuying: [],
  whatToSay: [],
  trace: [],
  sensitive: true,
});

/** A finished run with a card, one render with an image and a front photo. */
async function finished(opts: { owner?: string } = {}) {
  const { profileId, snapshotId } = await seed(opts);
  const runId = randomUUID();
  const renderId = randomUUID();
  await db
    .insert(run)
    .values({
      id: runId,
      snapshotId,
      templateKey: 'hair_loss_ahead',
      templateVersion: 1,
      budgetUnits: 40,
      status: 'done',
      stopReason: 'stopped_complete',
    });
  await db.insert(traceEntry).values([
    { runId, seq: 0, step: 'observe', inputs: {}, reason: 'observed' },
    { runId, seq: 1, step: 'stop', inputs: {}, reason: 'stopped_complete' },
  ]);
  const key = `renders/${profileId}/${snapshotId}/${renderId}.jpg`;
  await storage.put(key, Buffer.from('x'));
  await db
    .insert(render)
    .values({
      id: renderId,
      snapshotId,
      tool: 'hairstyle',
      strategy: 'cut',
      inputHash: 'h',
      objectKey: key,
      label: 'preview',
      expiresAt: new Date(Date.now() + 1e9),
    });
  await db
    .insert(photo)
    .values({
      snapshotId,
      kind: 'front',
      objectKey: `photos/${profileId}/${snapshotId}/front.jpg`,
      sha256: 'a',
      expiresAt: new Date(Date.now() + 1e9),
    });
  const [saved] = await db
    .insert(stageCard)
    .values({ runId, profileId, card: card(renderId) })
    .returning({ id: stageCard.id });
  return { profileId, snapshotId, runId, renderId, cardId: saved?.id ?? '', key };
}

describe('start', () => {
  it('resumes only the owner’s newest run and distinguishes a profile with no run', async () => {
    const { profileId, snapshotId } = await seed();
    expect(await service.latest(profileId, alice)).toEqual({ run: null });
    const started = await service.start(snapshotId, alice, 'source');
    expect(await service.latest(profileId, alice)).toMatchObject({
      run: { id: started.id, status: 'queued' },
    });
    await expect(service.latest(profileId, bob)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.latest(randomUUID(), alice)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('creates one queued run, caps its budget and queues it', async () => {
    const { snapshotId } = await seed();

    const view = await service.start(snapshotId, alice, 'source');

    expect(view).toMatchObject({ status: 'queued', cardId: null, trace: [] });
    expect(enqueue).toHaveBeenCalledWith(view.id);
    const [row] = await db.select().from(run);
    expect(row).toMatchObject({ budgetUnits: 40, templateVersion: 1, sourceHash: 'source' });
  });

  it('returns the same run when started twice, and queues it again only while it is still waiting', async () => {
    const { snapshotId } = await seed();
    const first = await service.start(snapshotId, alice, 's');
    const second = await service.start(snapshotId, alice, 's');
    expect(second.id).toBe(first.id);
    expect(await db.select().from(run)).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(2); // the queue ignores the repeat: its job id is the run id

    await db.update(run).set({ status: 'running' }).where(eq(run.id, first.id));
    await service.start(snapshotId, alice, 's');
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('recovers when queueing failed the first time', async () => {
    const { snapshotId } = await seed();
    enqueue.mockRejectedValueOnce(new Error('redis down'));
    await expect(service.start(snapshotId, alice, 's')).rejects.toThrow('redis down');
    await expect(service.start(snapshotId, alice, 's')).resolves.toMatchObject({
      status: 'queued',
    });
    expect(await db.select().from(run)).toHaveLength(1);
  });

  it('needs the current consent', async () => {
    const { snapshotId } = await seed({ consented: false });
    await expect(service.start(snapshotId, alice, 's')).rejects.toThrow(/consent/);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('who can see what (acceptance 23)', () => {
  it('answers 404 to another account on every route, and the owner can still read', async () => {
    const f = await finished();
    const { snapshotId } = await seed();

    for (const attempt of [
      () => service.start(snapshotId, bob, 's'),
      () => service.get(f.runId, bob),
      () => service.events(f.runId, bob),
      () => service.card(f.cardId, bob),
      () => service.approve(f.cardId, bob),
    ]) {
      await expect(attempt()).rejects.toThrow(NotFoundException);
    }
    expect(await service.cards(f.profileId, bob)).toEqual([]);
    expect(await service.get(f.runId, alice)).toMatchObject({ id: f.runId });
    expect(await service.cards(f.profileId, alice)).toHaveLength(1);
  });
});

describe('reading a run', () => {
  it('returns its trace in order, with the card id once there is a card', async () => {
    const f = await finished();
    const view = await service.get(f.runId, alice);
    expect(view).toMatchObject({
      status: 'done',
      stopReason: 'stopped_complete',
      cardId: f.cardId,
    });
    expect(view.trace.map((t) => t.reason)).toEqual(['observed', 'stopped_complete']);
  });

  it('streams the finished state once and ends', async () => {
    const f = await finished();
    const events = await firstValueFrom((await service.events(f.runId, alice)).pipe(toArray()));
    expect(events).toHaveLength(1);
    expect(events[0]?.data.status).toBe('done');
  });
});

describe('the card', () => {
  it('returns the card with short lived links to its renders and the front photo', async () => {
    const f = await finished();
    const view = await service.card(f.cardId, alice);
    expect(view.card.stageKey).toBe('full');
    expect(view.renderUrls[f.renderId]).toContain(f.key);
    expect(view.photoUrl).toContain('front.jpg');
    expect(view.bodyPhotoUrl).toBeNull();
    expect(view.approvedAt).toBeNull();
  });

  it('reads a card stored before clothes were added, with none shown', async () => {
    const f = await finished();
    const older: Partial<StageCard> = card(f.renderId);
    delete older.clothes;
    delete older.shoppingList;
    await db.update(stageCard).set({ card: older }).where(eq(stageCard.id, f.cardId));
    const view = await service.card(f.cardId, alice);
    expect(view.card).toMatchObject({ clothes: [], shoppingList: [], holdOffBuying: [] });
  });

  it('leaves out the link of a render whose image has expired, and keeps the card', async () => {
    const f = await finished();
    await db.update(render).set({ objectKey: null }).where(eq(render.id, f.renderId));
    const view = await service.card(f.cardId, alice);
    expect(view.renderUrls).toEqual({});
    expect(view.card.options).toHaveLength(1);
  });

  it('approves once and keeps the first time', async () => {
    const f = await finished();
    const first = await service.approve(f.cardId, alice);
    const again = await service.approve(f.cardId, alice);
    expect(again.approvedAt).toBe(first.approvedAt);
    expect((await service.card(f.cardId, alice)).approvedAt).toBe(first.approvedAt);
  });
});

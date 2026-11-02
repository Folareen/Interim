import { randomUUID } from 'node:crypto';
import { type Db, photo, profile, render, run, shareLink, snapshot, stageCard } from '@interim/db';
import type { StageCard } from '@interim/types';
import { NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { SharesService } from './shares.service';

const alice = { ref: 'alice' };
const bob = { ref: 'bob' };

let db: Db;
let storage: MemoryStorage;
let service: SharesService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile cascade`);
  storage = new MemoryStorage();
  service = new SharesService(db, storage.asService(), { secret: 's'.repeat(32), ttlDays: 7 });
});

/** A card that carries everything a share link must leave out, beside what it may show. */
async function seedCard(owner = alice.ref) {
  const profileId = randomUUID();
  const snapshotId = randomUUID();
  const runId = randomUUID();
  const lookId = randomUUID();
  const goneId = randomUUID();
  const clothId = randomUUID();
  await db.insert(profile).values({ id: profileId, templateKey: 'after_surgery', ownerRef: owner, consentVersion: '5', consentedAt: new Date(), headCovering: true });
  await db.insert(snapshot).values({ id: snapshotId, profileId, stageKey: 'recovering' });
  await db.insert(run).values({ id: runId, snapshotId, templateKey: 'after_surgery', templateVersion: 1, budgetUnits: 40, status: 'done' });
  const future = new Date(Date.now() + 1e9);
  await db.insert(render).values([
    { id: lookId, snapshotId, tool: 'hairstyle', strategy: 'cut', inputHash: 'a', objectKey: 'renders/look.jpg', label: 'preview', expiresAt: future },
    { id: goneId, snapshotId, tool: 'hairstyle', strategy: 'volume', inputHash: 'b', objectKey: null, label: 'preview', expiresAt: future },
    { id: clothId, snapshotId, tool: 'cloth_v4', inputHash: 'c', objectKey: 'renders/cloth.jpg', label: 'preview', expiresAt: future },
  ]);
  await db.insert(photo).values({ snapshotId, kind: 'front', objectKey: 'photos/front.jpg', sha256: 'p', expiresAt: future });
  const card: StageCard = {
    templateKey: 'after_surgery',
    stageKey: 'recovering',
    previousStageKey: null,
    locale: 'fr',
    takenAt: '2026-03-01T00:00:00.000Z',
    companionNote: { text: 'A private note about how this feels.', tone: 'warm', moment: 'video_call', fixed: false },
    changes: [{ tool: 'self_report', measurementId: null, value: { kind: 'reported_change', changed: 'lot' }, measuredAt: '2026-03-01T00:00:00.000Z', current: true }],
    options: [
      { renderId: lookId, tool: 'hairstyle', strategy: 'cut', label: 'preview', look: 'crop' },
      { renderId: goneId, tool: 'hairstyle', strategy: 'volume', label: 'preview' },
    ],
    clothes: [{ renderId: clothId, sku: 'tee-crew' }],
    advice: [
      { code: 'fullness_neckline', colours: [] },
      { code: 'surgery_photos_off', colours: [] },
    ],
    shoppingList: [{ sku: 'tee-crew', size: 'M' }],
    holdOffBuying: [{ item: 'jacket-light', reason: 'size_moving' }],
    whatToSay: ['A line for a conversation.'],
    trace: [{ seq: 0, step: 'decide', reason: 'blocked_head_covering', tool: null, costUnits: 0 }],
    sensitive: true,
  };
  const [saved] = await db.insert(stageCard).values({ runId, profileId, card }).returning({ id: stageCard.id });
  return { cardId: saved?.id ?? '', profileId };
}

describe('create', () => {
  it('stores a hash, never the token, and expires in a week', async () => {
    const { cardId } = await seedCard();

    const link = await service.create(cardId, alice);

    const [row] = await db.select().from(shareLink);
    expect(row?.tokenHash).not.toContain(link.token);
    expect(row?.id).toBe(link.id);
    const days = (new Date(link.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('answers 404 for another person’s card and stores nothing', async () => {
    const { cardId } = await seedCard();
    await expect(service.create(cardId, bob)).rejects.toThrow(NotFoundException);
    expect(await db.select().from(shareLink)).toEqual([]);
  });

  it('gives each link its own token', async () => {
    const { cardId } = await seedCard();
    const a = await service.create(cardId, alice);
    const b = await service.create(cardId, alice);
    expect(a.token).not.toBe(b.token);
  });
});

describe('view', () => {
  it('shows the renders and the card text a reader can use, and only those', async () => {
    const { cardId } = await seedCard();
    const { token, expiresAt } = await service.create(cardId, alice);

    const view = await service.view(token);

    expect(view).toEqual({
      takenAt: '2026-03-01T00:00:00.000Z',
      options: [{ url: 'https://r2.test/renders/look.jpg?signed=1', strategy: 'cut', label: 'preview', look: 'crop' }],
      advice: [{ code: 'fullness_neckline', colours: [] }],
      clothes: [{ url: 'https://r2.test/renders/cloth.jpg?signed=1', sku: 'tee-crew' }],
      shoppingList: [{ sku: 'tee-crew', size: 'M' }],
      expiresAt,
    });
  });

  it('carries nothing that identifies the person or speaks of their situation', async () => {
    const { cardId, profileId } = await seedCard();
    const { token } = await service.create(cardId, alice);

    const text = JSON.stringify(await service.view(token));

    for (const secret of [profileId, cardId, alice.ref, 'after_surgery', 'recovering', 'private note', 'video_call', 'blocked_head_covering', 'A line for a conversation', 'size_moving', 'jacket-light', 'photos/front.jpg', 'surgery_photos_off']) {
      expect(text).not.toContain(secret);
    }
  });

  it('answers 404 for a token that was never issued', async () => {
    await expect(service.view('n'.repeat(43))).rejects.toThrow(NotFoundException);
  });

  it('answers 404 once the link has expired', async () => {
    const { cardId } = await seedCard();
    const { token, id } = await service.create(cardId, alice);
    await db.update(shareLink).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(shareLink.id, id));
    await expect(service.view(token)).rejects.toThrow(NotFoundException);
  });
});

describe('revoke', () => {
  it('makes the link answer 404, and does the same when asked twice', async () => {
    const { cardId } = await seedCard();
    const { token, id } = await service.create(cardId, alice);
    await service.view(token);

    await service.revoke(id, alice);
    const [first] = await db.select().from(shareLink);
    await service.revoke(id, alice);
    const [second] = await db.select().from(shareLink);

    await expect(service.view(token)).rejects.toThrow(NotFoundException);
    expect(second?.revokedAt).toEqual(first?.revokedAt);
  });

  it('leaves the person’s other links working', async () => {
    const { cardId } = await seedCard();
    const keep = await service.create(cardId, alice);
    const drop = await service.create(cardId, alice);
    await service.revoke(drop.id, alice);
    await expect(service.view(keep.token)).resolves.toBeDefined();
  });

  it('answers 404 to someone else and leaves the link working', async () => {
    const { cardId } = await seedCard();
    const { token, id } = await service.create(cardId, alice);
    await expect(service.revoke(id, bob)).rejects.toThrow(NotFoundException);
    await expect(service.revoke(randomUUID(), alice)).rejects.toThrow(NotFoundException);
    await expect(service.view(token)).resolves.toBeDefined();
  });
});

describe('list', () => {
  it('lists only links that still work, for the owner', async () => {
    const { cardId } = await seedCard();
    const live = await service.create(cardId, alice);
    const revoked = await service.create(cardId, alice);
    const expired = await service.create(cardId, alice);
    await service.revoke(revoked.id, alice);
    await db.update(shareLink).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(shareLink.id, expired.id));

    expect((await service.list(cardId, alice)).map((l) => l.id)).toEqual([live.id]);
    await expect(service.list(cardId, bob)).rejects.toThrow(NotFoundException);
  });
});

describe('deleting the card', () => {
  it('removes its links', async () => {
    const { cardId } = await seedCard();
    const { token } = await service.create(cardId, alice);
    await db.delete(stageCard).where(eq(stageCard.id, cardId));
    await expect(service.view(token)).rejects.toThrow(NotFoundException);
  });
});

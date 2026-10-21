import { type Db, deletionRequest, photo, profile, render, snapshot } from '@interim/db';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { CleanupService } from './cleanup.service';

const HOUR = 60 * 60 * 1000;
const alive = '3f2b8a0e-7c2d-4a39-9d57-0d7a6a1f2b11';
const deleted = '5c1d9e2f-8a3b-4c4d-9e5f-1a2b3c4d5e6f';
const snapshotId = '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b';
const start = Date.now();
const now = new Date(start + 3 * HOUR);
const ago = (ms: number) => new Date(now.getTime() - ms);

let db: Db;
let storage: MemoryStorage;
let cleanup: CleanupService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile, deletion_request cascade`);
  storage = new MemoryStorage();
  cleanup = new CleanupService(db, storage.asService());
  await db.insert(profile).values({ id: alive, templateKey: 'going_grey', ownerRef: 'o', consentVersion: '1' });
  await db.insert(snapshot).values({ id: snapshotId, profileId: alive });
});

const put = (key: string, age = 0) => storage.put(key, Buffer.from('x'), 'image/jpeg', ago(age));
const keys = () => [...storage.objects.keys()].sort();

async function addPhoto(key: string, expiresAt: Date, withObject = true) {
  await db.insert(photo).values({ snapshotId, kind: 'front', objectKey: key, sha256: 'h', expiresAt });
  if (withObject) await put(key, 10 * 60 * 1000);
}

describe('expiry', () => {
  it('deletes expired photos and their files and keeps the rest', async () => {
    await addPhoto(`photos/${alive}/${snapshotId}/old.jpg`, ago(HOUR));
    await addPhoto(`photos/${alive}/${snapshotId}/new.jpg`, new Date(now.getTime() + HOUR));

    const report = await cleanup.run(now);

    expect(report.expiredPhotos).toBe(1);
    expect(keys()).toEqual([`photos/${alive}/${snapshotId}/new.jpg`]);
    expect(await db.select().from(photo)).toHaveLength(1);
  });

  it('removes the image of an expired render but keeps the row', async () => {
    const key = `renders/${alive}/r.jpg`;
    await put(key);
    await db.insert(render).values({ snapshotId, tool: 'hairstyle', inputHash: 'h', objectKey: key, label: 'preview', expiresAt: ago(HOUR) });

    const report = await cleanup.run(now);

    expect(report.expiredRenders).toBe(1);
    expect(storage.objects.has(key)).toBe(false);
    expect((await db.select().from(render))[0]?.objectKey).toBeNull();
  });
});

describe('bucket sweep', () => {
  it('removes every file of a deleted profile at once, across pages', async () => {
    for (const n of [1, 2, 3, 4, 5]) await put(`photos/${deleted}/s/${n}.jpg`, 1000);
    await put(`raw/${deleted}/u`, 1000);

    const report = await cleanup.run(now);

    expect(report.orphansDeleted).toBe(6);
    expect(keys()).toEqual([]);
  });

  it('keeps referenced files and gives unreferenced ones of a live profile a grace period', async () => {
    const referenced = `photos/${alive}/${snapshotId}/front.jpg`;
    await addPhoto(referenced, new Date(now.getTime() + HOUR));
    await put(`photos/${alive}/x/stale.jpg`, 2 * HOUR);
    await put(`photos/${alive}/x/fresh.jpg`, 10 * 60 * 1000);
    await put(`raw/${alive}/stale`, 25 * HOUR);
    await put(`raw/${alive}/fresh`, 2 * HOUR);

    const report = await cleanup.run(now);

    expect(report.orphansDeleted).toBe(2);
    expect(keys()).toEqual([referenced, `photos/${alive}/x/fresh.jpg`, `raw/${alive}/fresh`].sort());
  });

  it('leaves keys that do not follow the layout alone', async () => {
    await put('raw/not-a-uuid/file', 48 * HOUR);
    const report = await cleanup.run(now);
    expect(report.orphansDeleted).toBe(0);
    expect(keys()).toEqual(['raw/not-a-uuid/file']);
  });

  it('reports settled photo rows whose file is missing, and ignores brand new rows', async () => {
    await addPhoto(`photos/${alive}/${snapshotId}/gone.jpg`, new Date(now.getTime() + HOUR), false);
    const early = await cleanup.run(new Date(start + 5 * 60 * 1000));
    expect(early.missingPhotoIds).toEqual([]);

    const report = await cleanup.run(now);
    const [row] = await db.select({ id: photo.id }).from(photo);
    expect(report.missingPhotoIds).toEqual([row?.id]);
  });
});

describe('deletion requests', () => {
  it('completes requests made before the run and leaves later ones', async () => {
    await db.insert(deletionRequest).values([{ requestedAt: ago(HOUR) }, { requestedAt: new Date(now.getTime() + HOUR) }]);

    const report = await cleanup.run(now);

    expect(report.completedDeletions).toBe(1);
    const rows = await db.select().from(deletionRequest).where(eq(deletionRequest.completedAt, now));
    expect(rows).toHaveLength(1);
  });
});

describe('repeat runs', () => {
  it('does nothing the second time', async () => {
    await addPhoto(`photos/${alive}/${snapshotId}/old.jpg`, ago(HOUR));
    await put(`photos/${deleted}/s/1.jpg`);
    await db.insert(deletionRequest).values({ requestedAt: ago(HOUR) });
    await cleanup.run(now);

    expect(await cleanup.run(now)).toEqual({
      expiredPhotos: 0,
      expiredRenders: 0,
      orphansDeleted: 0,
      missingPhotoIds: [],
      completedDeletions: 0,
    });
  });
});

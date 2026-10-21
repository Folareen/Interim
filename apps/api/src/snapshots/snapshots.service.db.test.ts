import { type Db, photo, selfReport, snapshot } from '@interim/db';
import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProfilesService } from '../profiles/profiles.service';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { SnapshotsService } from './snapshots.service';

const owner = { ref: 'alice' };
const consent = (retention: 'standard' | 'extended') =>
  ({
    action: 'grant',
    version: '2',
    retention,
    acceptStorage: true,
    acceptYoucam: true,
    acceptGemini: true,
    acceptOwnPhotosOnly: true,
  }) as const;

let db: Db;
let storage: MemoryStorage;
let profiles: ProfilesService;
let snapshots: SnapshotsService;
let jpeg: Buffer;

beforeAll(async () => {
  db = await createTestDb();
  jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#a87850' } }).jpeg().toBuffer();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile cascade`);
  storage = new MemoryStorage();
  profiles = new ProfilesService(db, storage.asService());
  snapshots = new SnapshotsService(db, profiles, storage.asService(), { maxUploadBytes: 12 * 1024 * 1024 });
});

async function newProfile(
  retention: 'standard' | 'extended' = 'standard',
  templateKey: 'going_grey' | 'after_surgery' = 'going_grey',
) {
  const { id } = await profiles.create(owner, { templateKey, ageConfirmed: true });
  await profiles.consent(id, owner, consent(retention));
  return id;
}

/** Asks for upload links and puts a file behind each, as the browser would. */
async function upload(profileId: string, kinds: ('front' | 'left' | 'right' | 'top' | 'body')[], body = jpeg) {
  const { uploads } = await snapshots.createUploads(profileId, owner, {
    uploads: kinds.map((kind) => ({ kind, sizeBytes: body.length })),
  });
  for (const u of uploads) await storage.put(`raw/${profileId}/${u.uploadId}`, body);
  return uploads.map((u) => ({ uploadId: u.uploadId, kind: u.kind }));
}

describe('baseline', () => {
  it('stores normalised photos and rows, and deletes the raw uploads', async () => {
    const id = await newProfile();
    const uploads = await upload(id, ['front', 'left', 'right']);

    const saved = await snapshots.create(id, owner, { uploads });

    expect(saved.isBaseline).toBe(true);
    const photos = await db.select().from(photo).where(eq(photo.snapshotId, saved.id));
    expect(photos.map((p) => p.kind).sort()).toEqual(['front', 'left', 'right']);
    expect(photos.every((p) => storage.objects.has(p.s3Key))).toBe(true);
    expect([...storage.objects.keys()].filter((k) => k.startsWith('raw/'))).toEqual([]);
    expect(photos[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses before the person has consented', async () => {
    const { id } = await profiles.create(owner, { templateKey: 'going_grey', ageConfirmed: true });
    await expect(snapshots.createUploads(id, owner, { uploads: [{ kind: 'front', sizeBytes: 10 }] })).rejects.toThrow(ForbiddenException);
  });

  it('asks for the missing photos and stores nothing', async () => {
    const id = await newProfile();
    const uploads = await upload(id, ['front']);
    await expect(snapshots.create(id, owner, { uploads })).rejects.toThrow(/left, right/);
    expect(await db.select().from(snapshot)).toEqual([]);
  });

  it('rejects a file that is not an image, whatever the upload says', async () => {
    const id = await newProfile();
    const uploads = await upload(id, ['front', 'left', 'right'], Buffer.from('not a photo'));
    await expect(snapshots.create(id, owner, { uploads })).rejects.toThrow(UnprocessableEntityException);
    expect(await db.select().from(snapshot)).toEqual([]);
  });

  it('rejects an upload id that never arrived', async () => {
    const id = await newProfile();
    const uploads = await upload(id, ['front', 'left', 'right']);
    storage.objects.delete(`raw/${id}/${uploads[0]?.uploadId}`);
    await expect(snapshots.create(id, owner, { uploads })).rejects.toThrow(/did not upload/);
  });

  it('lets only one of two simultaneous requests be the baseline', async () => {
    const id = await newProfile();
    const a = await upload(id, ['front', 'left', 'right']);
    const b = await upload(id, ['front', 'left', 'right']);

    const results = await Promise.allSettled([
      snapshots.create(id, owner, { uploads: a }),
      snapshots.create(id, owner, { uploads: b }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictException) });
    expect(await db.select().from(snapshot)).toHaveLength(1);
  });
});

describe('check in', () => {
  it('needs the self report, and saves it with the snapshot', async () => {
    const id = await newProfile();
    await snapshots.create(id, owner, { uploads: await upload(id, ['front', 'left', 'right']) });

    const noReport = await upload(id, ['front']);
    await expect(snapshots.create(id, owner, { uploads: noReport })).rejects.toThrow(/anything has changed/);

    const saved = await snapshots.create(id, owner, {
      uploads: await upload(id, ['front']),
      selfReport: { changed: 'some' },
    });
    expect(saved.isBaseline).toBe(false);
    expect(await db.select().from(selfReport).where(eq(selfReport.snapshotId, saved.id))).toHaveLength(1);
  });

  it('saves the moment, at the baseline too', async () => {
    const id = await newProfile();
    const saved = await snapshots.create(id, owner, {
      uploads: await upload(id, ['front', 'left', 'right']),
      moment: 'back_to_work',
    });
    expect(saved.moment).toBe('back_to_work');
    const [row] = await db.select({ moment: snapshot.moment }).from(snapshot).where(eq(snapshot.id, saved.id));
    expect(row?.moment).toBe('back_to_work');
  });

  it('after surgery, takes no body photo until the person turns body photos on', async () => {
    const id = await newProfile('standard', 'after_surgery');
    await expect(
      snapshots.create(id, owner, { uploads: await upload(id, ['front', 'left', 'right', 'body']) }),
    ).rejects.toThrow(/Body photos are off/);

    await snapshots.create(id, owner, { uploads: await upload(id, ['front', 'left', 'right']) });

    await profiles.setPreferences(id, owner, { locale: 'en', tone: 'warm', wordsSet: null, bodyPhotos: true, headCovering: false });
    await expect(
      snapshots.create(id, owner, { uploads: await upload(id, ['front']), selfReport: { changed: 'some', reportedSize: 'M' } }),
    ).rejects.toThrow(/body photo/);
  });

  it('refuses side photos after the first set', async () => {
    const id = await newProfile();
    await snapshots.create(id, owner, { uploads: await upload(id, ['front', 'left', 'right']) });
    await expect(
      snapshots.create(id, owner, { uploads: await upload(id, ['front', 'left']), selfReport: { changed: 'none' } }),
    ).rejects.toThrow(/first set/);
  });

  it('keep history restarts the clock on earlier photos; standard does not', async () => {
    for (const [retention, slides] of [['extended', true], ['standard', false]] as const) {
      await db.execute(sql`truncate profile cascade`);
      const id = await newProfile(retention);
      const first = await snapshots.create(id, owner, { uploads: await upload(id, ['front', 'left', 'right']) });
      const early = new Date('2026-01-01T00:00:00Z');
      await db.update(photo).set({ expiresAt: early }).where(eq(photo.snapshotId, first.id));

      await snapshots.create(id, owner, { uploads: await upload(id, ['front']), selfReport: { changed: 'none' } });

      const [row] = await db.select({ at: photo.expiresAt }).from(photo).where(eq(photo.snapshotId, first.id));
      expect(row?.at.getTime() !== early.getTime()).toBe(slides);
    }
  });
});

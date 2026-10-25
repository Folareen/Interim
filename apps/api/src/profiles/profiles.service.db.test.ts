import { type Db, consentEvent, deletionRequest, photo, profile, render, snapshot } from '@interim/db';
import type { ConsentRequest } from '@interim/types';
import { NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { ProfilesService } from './profiles.service';

const alice = { ref: 'alice' };
const bob = { ref: 'bob' };
const grant = (retention: 'standard' | 'extended'): ConsentRequest => ({
  action: 'grant',
  version: '4',
  retention,
  acceptStorage: true,
  acceptYoucam: true,
  acceptGemini: true,
  acceptOwnPhotosOnly: true,
});

let db: Db;
let storage: MemoryStorage;
let profiles: ProfilesService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile, deletion_request cascade`);
  storage = new MemoryStorage();
  profiles = new ProfilesService(db, storage.asService());
});

const create = () => profiles.create(alice, { templateKey: 'going_grey', ageConfirmed: true });

describe('create, get and list', () => {
  it('starts without consent and never exposes the owner ref', async () => {
    const created = await create();
    expect(created).toMatchObject({ templateKey: 'going_grey', consentedAt: null, consentCurrent: false, retention: 'standard' });
    expect(created).not.toHaveProperty('ownerRef');
  });

  it('shows a profile only to its owner', async () => {
    const { id } = await create();
    expect((await profiles.get(id, alice)).id).toBe(id);
    await expect(profiles.get(id, bob)).rejects.toThrow(NotFoundException);
    expect(await profiles.list(bob)).toEqual([]);
    expect(await profiles.list(alice)).toHaveLength(1);
  });
});

describe('consent', () => {
  it('records a grant with its retention choice, then a withdrawal', async () => {
    const { id } = await create();

    const granted = await profiles.consent(id, alice, grant('extended'));
    expect(granted).toMatchObject({ consentCurrent: true, retention: 'extended', consentVersion: '4' });

    const withdrawn = await profiles.consent(id, alice, { action: 'withdraw', version: '4' });
    expect(withdrawn).toMatchObject({ consentCurrent: false, consentedAt: null });

    const events = await db.select().from(consentEvent);
    expect(events.map((e) => e.action).sort()).toEqual(['grant', 'withdraw']);
  });

  it('does not let another owner consent', async () => {
    const { id } = await create();
    await expect(profiles.consent(id, bob, grant('standard'))).rejects.toThrow(NotFoundException);
  });

  it('moves existing files to the new retention rule when it is switched', async () => {
    const { id } = await create();
    await profiles.consent(id, alice, grant('extended'));
    const first = new Date('2026-01-10T00:00:00Z');
    const last = new Date('2026-03-10T00:00:00Z');
    for (const takenAt of [first, last]) {
      const [s] = await db.insert(snapshot).values({ profileId: id, takenAt }).returning({ id: snapshot.id });
      await db.insert(photo).values({ snapshotId: s?.id ?? '', kind: 'front', objectKey: `k${takenAt.getTime()}`, sha256: 'h', expiresAt: new Date('2030-01-01') });
    }

    await profiles.consent(id, alice, grant('standard'));
    const standard = (await db.select({ at: photo.expiresAt, key: photo.objectKey }).from(photo)).map((p) => [p.key, p.at.toISOString()]);
    expect(Object.fromEntries(standard)).toEqual({
      [`k${first.getTime()}`]: '2026-02-09T00:00:00.000Z',
      [`k${last.getTime()}`]: '2026-04-09T00:00:00.000Z',
    });

    await profiles.consent(id, alice, grant('extended'));
    const extended = await db.select({ at: photo.expiresAt }).from(photo);
    expect(extended.every((p) => p.at.toISOString() === '2028-03-10T00:00:00.000Z')).toBe(true);
  });
});

describe('preferences', () => {
  it('starts warm, with words for today off and body photos from the template', async () => {
    const { id } = await create();
    expect(await profiles.preferences(id, alice)).toEqual({ locale: 'en', tone: 'warm', wordsSet: null, bodyPhotos: true, headCovering: false });

    const surgery = await profiles.create(alice, { templateKey: 'after_surgery', ageConfirmed: true });
    expect(surgery.bodyPhotos).toBe(false);
  });

  it('saves a change and keeps the words set and head covering out of the profile view', async () => {
    const { id } = await create();
    const next = { locale: 'en', tone: 'practical', wordsSet: 'muslim', bodyPhotos: false, headCovering: true } as const;
    expect(await profiles.setPreferences(id, alice, next)).toEqual(next);
    expect(await profiles.preferences(id, alice)).toEqual(next);

    const seen = await profiles.get(id, alice);
    expect(seen).toMatchObject({ tone: 'practical', bodyPhotos: false });
    expect(seen).not.toHaveProperty('wordsSet');
    expect(seen).not.toHaveProperty('headCovering');
  });

  it('is for the profile owner only', async () => {
    const { id } = await create();
    await expect(profiles.setPreferences(id, bob, { locale: 'en', tone: 'light', wordsSet: null, bodyPhotos: true, headCovering: false })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('words for today', () => {
  it('returns nothing while off, then the passage for the chosen set and date', async () => {
    const { id } = await create();
    expect(await profiles.words(id, alice, '2026-10-20')).toEqual({ words: null });

    await profiles.setPreferences(id, alice, { locale: 'en', tone: 'warm', wordsSet: 'jewish', bodyPhotos: true, headCovering: false });
    const { words } = await profiles.words(id, alice, '2026-10-20');
    expect(words).toMatchObject({ set: 'jewish', label: 'Tanakh verses', translation: 'JPS 1917', locale: 'en' });
    expect(words?.text).toBeTruthy();
    expect(words?.source).toBeTruthy();
  });
});

describe('export', () => {
  it('returns the profile, its preferences and its consent history', async () => {
    const { id } = await create();
    await profiles.consent(id, alice, grant('standard'));
    const exported = await profiles.export(id, alice);
    expect(exported.profile.id).toBe(id);
    expect(exported.preferences).toEqual({ locale: 'en', tone: 'warm', wordsSet: null, bodyPhotos: true, headCovering: false });
    expect(exported.consentEvents).toHaveLength(1);
    expect(exported.renders).toEqual([]);
    await expect(profiles.export(id, bob)).rejects.toThrow(NotFoundException);
  });
});

describe('export of renders', () => {
  it('links each render that is still stored, newest check in first, and skips an expired one', async () => {
    const { id } = await create();
    const [older] = await db.insert(snapshot).values({ profileId: id, takenAt: new Date('2026-01-01') }).returning({ id: snapshot.id });
    const [newer] = await db.insert(snapshot).values({ profileId: id, takenAt: new Date('2026-02-01') }).returning({ id: snapshot.id });
    const row = (snapshotId: string | undefined, inputHash: string, objectKey: string | null) => ({
      snapshotId: snapshotId ?? '', tool: 'hairstyle', strategy: 'cut' as const, inputHash, objectKey, label: 'preview', expiresAt: new Date(Date.now() + 1e9),
    });
    await db.insert(render).values([
      row(older?.id, 'a', 'renders/old.jpg'),
      row(newer?.id, 'b', 'renders/new.jpg'),
      row(newer?.id, 'c', null),
    ]);

    const { renders } = await profiles.export(id, alice);

    expect(renders.map((r) => r.url)).toEqual(['https://r2.test/renders/new.jpg?signed=1', 'https://r2.test/renders/old.jpg?signed=1']);
    await expect(profiles.export(id, bob)).rejects.toThrow(NotFoundException);
  });
});

describe('archive', () => {
  it('holds export.json and each stored image, and says which file each render is', async () => {
    const { id } = await create();
    const [s] = await db.insert(snapshot).values({ profileId: id }).returning({ id: snapshot.id });
    const row = (inputHash: string, objectKey: string | null) => ({
      snapshotId: s?.id ?? '', tool: 'hairstyle', strategy: 'cut' as const, inputHash, objectKey, label: 'preview', expiresAt: new Date(Date.now() + 1e9),
    });
    const [kept, expired] = await db.insert(render).values([row('a', 'renders/a.jpg'), row('b', null)]).returning({ id: render.id });
    await storage.put('renders/a.jpg', Buffer.from('image-bytes'));

    const files = unzipSync(await profiles.archive(id, alice, { reflections: [] }));

    expect(Object.keys(files).sort()).toEqual(['export.json', `renders/${kept?.id}.jpg`]);
    expect(strFromU8(files[`renders/${kept?.id}.jpg`] ?? new Uint8Array())).toBe('image-bytes');
    const json = JSON.parse(strFromU8(files['export.json'] ?? new Uint8Array()));
    expect(json.renders).toEqual([expect.objectContaining({ id: kept?.id, file: `renders/${kept?.id}.jpg` })]);
    expect(JSON.stringify(json)).not.toContain(expired?.id ?? 'x');
    expect(json.reflections).toEqual([]);
    expect(JSON.stringify(json)).not.toContain('r2.test');
  });

  it('answers 404 to someone else', async () => {
    const { id } = await create();
    await expect(profiles.archive(id, bob, {})).rejects.toThrow(NotFoundException);
  });
});

describe('remove', () => {
  it('hard deletes everything under the profile and its files, and records a deletion request', async () => {
    const { id } = await create();
    const [s] = await db.insert(snapshot).values({ profileId: id }).returning({ id: snapshot.id });
    await db.insert(photo).values({ snapshotId: s?.id ?? '', kind: 'front', objectKey: `photos/${id}/x/front.jpg`, sha256: 'h', expiresAt: new Date() });
    await storage.put(`photos/${id}/x/front.jpg`, Buffer.from('x'));
    await storage.put(`raw/${id}/u`, Buffer.from('x'));
    await storage.put('photos/other/keep.jpg', Buffer.from('x'));

    await profiles.remove(id, alice);

    expect(await db.select().from(profile)).toEqual([]);
    expect(await db.select().from(snapshot)).toEqual([]);
    expect(await db.select().from(photo)).toEqual([]);
    expect([...storage.objects.keys()]).toEqual(['photos/other/keep.jpg']);
    const requests = await db.select().from(deletionRequest);
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty('profileId');
  });

  it('refuses another owner and changes nothing', async () => {
    const { id } = await create();
    await expect(profiles.remove(id, bob)).rejects.toThrow(NotFoundException);
    expect(await db.select().from(profile)).toHaveLength(1);
    expect(await db.select().from(deletionRequest)).toEqual([]);
  });
});

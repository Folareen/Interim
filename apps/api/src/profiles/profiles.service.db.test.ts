import { type Db, consentEvent, deletionRequest, photo, profile, snapshot } from '@interim/db';
import type { ConsentRequest } from '@interim/types';
import { NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { ProfilesService } from './profiles.service';

const alice = { kind: 'person', ref: 'alice' } as const;
const bob = { kind: 'person', ref: 'bob' } as const;
const grant = (retention: 'standard' | 'extended'): ConsentRequest => ({
  action: 'grant',
  version: '1',
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
    expect(granted).toMatchObject({ consentCurrent: true, retention: 'extended', consentVersion: '1' });

    const withdrawn = await profiles.consent(id, alice, { action: 'withdraw', version: '1' });
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
      await db.insert(photo).values({ snapshotId: s?.id ?? '', kind: 'front', s3Key: `k${takenAt.getTime()}`, sha256: 'h', expiresAt: new Date('2030-01-01') });
    }

    await profiles.consent(id, alice, grant('standard'));
    const standard = (await db.select({ at: photo.expiresAt, key: photo.s3Key }).from(photo)).map((p) => [p.key, p.at.toISOString()]);
    expect(Object.fromEntries(standard)).toEqual({
      [`k${first.getTime()}`]: '2026-02-09T00:00:00.000Z',
      [`k${last.getTime()}`]: '2026-04-09T00:00:00.000Z',
    });

    await profiles.consent(id, alice, grant('extended'));
    const extended = await db.select({ at: photo.expiresAt }).from(photo);
    expect(extended.every((p) => p.at.toISOString() === '2028-03-10T00:00:00.000Z')).toBe(true);
  });
});

describe('export', () => {
  it('returns the profile and its consent history', async () => {
    const { id } = await create();
    await profiles.consent(id, alice, grant('standard'));
    const exported = await profiles.export(id, alice);
    expect(exported.profile.id).toBe(id);
    expect(exported.consentEvents).toHaveLength(1);
    await expect(profiles.export(id, bob)).rejects.toThrow(NotFoundException);
  });
});

describe('remove', () => {
  it('hard deletes everything under the profile and its files, and records a deletion request', async () => {
    const { id } = await create();
    const [s] = await db.insert(snapshot).values({ profileId: id }).returning({ id: snapshot.id });
    await db.insert(photo).values({ snapshotId: s?.id ?? '', kind: 'front', s3Key: `photos/${id}/x/front.jpg`, sha256: 'h', expiresAt: new Date() });
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

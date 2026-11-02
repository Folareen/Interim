import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Db, ledgerEntry, profile, run, stylePhoto, stylePreview, traceEntry } from '@interim/db';
import { CONSENT_VERSION } from '@interim/rules';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../ledger/ledger.service';
import type { ProfilesService } from '../profiles/profiles.service';
import { MemoryStorage } from '../test/memory-storage';
import { darkJpeg, texturedJpeg } from '../test/photos';
import { createTestDb } from '../test/test-db';
import { writeYoucamFixture } from '../test/youcam-fixtures';
import { YoucamClient } from '../youcam/youcam.client';
import { YoucamGateway, youcamFixtureKey } from '../youcam/youcam.gateway';
import { StyleRenderService } from './style-render.service';
import { StyleService } from './style.service';

const alice = { ref: 'alice' };
const bob = { ref: 'bob' };
// Must match the parameters the recorded experiment used, or its results are not found.
const params = { garment_category: 'full_body', change_shoes: false, filter_multi_person: 'strict' };

let db: Db;
let dir: string;
let storage: MemoryStorage;
let enqueue: ReturnType<typeof vi.fn<(runId: string) => Promise<void>>>;
let style: StyleService;
let renderer: StyleRenderService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile, budget_counter, ledger_entry cascade`);
  dir = await mkdtemp(path.join(tmpdir(), 'style-'));
  storage = new MemoryStorage();
  enqueue = vi.fn(() => Promise.resolve());
  const ledger = new LedgerService(db, { perProfile: 500, perDay: 2000, perSourcePerDay: 100 }, {} as ProfilesService);
  const client = new YoucamClient({ apiKey: '', baseUrl: 'https://youcam.test', mode: 'replay', liveCallsEnabled: false, fixturesDir: dir, retryBaseMs: 0 });
  const gateway = new YoucamGateway(db, client, storage.asService(), ledger, { firstPollMs: 0, maxPollMs: 0, timeoutMs: 1000 });
  style = new StyleService(db, storage.asService(), ledger, { enqueue }, { runBudgetCap: 50 }, { maxUploadBytes: 12 * 1024 * 1024 });
  renderer = new StyleRenderService(db, gateway, ledger);
});

afterAll(async () => rm(dir, { recursive: true, force: true }));

async function newProfile(over: { kind?: 'style' | 'situation'; consented?: boolean; owner?: string } = {}) {
  const id = randomUUID();
  const kind = over.kind ?? 'style';
  await db.insert(profile).values({
    id,
    kind,
    templateKey: kind === 'style' ? null : 'going_grey',
    ownerRef: over.owner ?? alice.ref,
    consentVersion: CONSENT_VERSION,
    consentedAt: over.consented === false ? null : new Date(),
  });
  return id;
}

/** Puts a raw upload in storage and adds it, the way the browser does after its PUT. */
async function addPhoto(profileId: string, role: 'reference' | 'current', bytes?: Buffer) {
  const uploadId = randomUUID();
  await storage.put(`raw/${profileId}/${uploadId}`, bytes ?? (await texturedJpeg()));
  return style.addPhoto(profileId, alice, { uploadId, role });
}

async function shaOf(photoId: string) {
  const [row] = await db.select().from(stylePhoto).where(eq(stylePhoto.id, photoId));
  if (!row) throw new Error('photo missing');
  return row.sha256;
}

/** A current photo with `n` references, and the request made from them. */
async function request(n = 1) {
  const profileId = await newProfile();
  const current = await addPhoto(profileId, 'current');
  const refs = [];
  for (let i = 0; i < n; i += 1) refs.push(await addPhoto(profileId, 'reference'));
  const made = await style.createRequest(profileId, alice, { currentPhotoId: current.id, referencePhotoIds: refs.map((r) => r.id) }, 'src');
  return { profileId, current, refs, ...made };
}

async function record(currentId: string, refId: string) {
  const key = youcamFixtureKey([await shaOf(currentId), await shaOf(refId)], 'cloth_v4', params);
  await writeYoucamFixture(dir, 'cloth_v4', key, { results: { url: 'https://example.test/r.jpg' } }, await texturedJpeg(100, 100));
}

describe('photos', () => {
  it('stores a photo under the profile and removes the raw upload', async () => {
    const profileId = await newProfile();
    const uploadId = randomUUID();
    await storage.put(`raw/${profileId}/${uploadId}`, await texturedJpeg());

    const added = await style.addPhoto(profileId, alice, { uploadId, role: 'reference' });

    expect(storage.objects.has(`photos/${profileId}/style/${added.id}.jpg`)).toBe(true);
    expect(storage.objects.has(`raw/${profileId}/${uploadId}`)).toBe(false);
  });

  it('stores the same picture once', async () => {
    const profileId = await newProfile();
    const bytes = await texturedJpeg();
    const first = await addPhoto(profileId, 'reference', bytes);
    const second = await addPhoto(profileId, 'reference', bytes);

    expect(second.id).toBe(first.id);
    expect(await db.select().from(stylePhoto)).toHaveLength(1);
  });

  it('refuses a current photo that is too dark, but not a reference', async () => {
    const profileId = await newProfile();
    await expect(addPhoto(profileId, 'current', await darkJpeg())).rejects.toMatchObject({ response: { code: 'too_dark' } });
    await expect(addPhoto(profileId, 'reference', await darkJpeg())).resolves.toMatchObject({ role: 'reference' });
  });

  it('answers 404 for another person’s profile and 409 for a situation profile', async () => {
    const mine = await newProfile();
    await expect(style.photos(mine, bob)).rejects.toBeInstanceOf(NotFoundException);
    const situation = await newProfile({ kind: 'situation' });
    await expect(style.photos(situation, alice)).rejects.toBeInstanceOf(ConflictException);
  });

  it('asks for consent before uploads', async () => {
    const profileId = await newProfile({ consented: false });
    await expect(style.createUploads(profileId, alice, { uploads: [{ sizeBytes: 10 }] })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('createRequest', () => {
  it('creates a queued run with a budget of two units per reference and enqueues it once', async () => {
    const made = await request(2);

    const [row] = await db.select().from(run).where(eq(run.id, made.runId));
    expect(row).toMatchObject({ status: 'queued', budgetUnits: 4, snapshotId: null, styleRequestId: made.requestId });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(made.runId);
  });

  it('refuses a reference that is not a reference photo, and photos of another profile', async () => {
    const profileId = await newProfile();
    const current = await addPhoto(profileId, 'current');
    const other = await newProfile();
    const foreign = await addPhoto(other, 'reference');
    await expect(
      style.createRequest(profileId, alice, { currentPhotoId: current.id, referencePhotoIds: [current.id] }, 's'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      style.createRequest(profileId, alice, { currentPhotoId: current.id, referencePhotoIds: [foreign.id] }, 's'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses when the budget cannot cover the previews, before any run exists', async () => {
    const profileId = await newProfile();
    const current = await addPhoto(profileId, 'current');
    const ref = await addPhoto(profileId, 'reference');
    await db.execute(sql`insert into budget_counter (scope, reserved_units, settled_units) values (${`profile:${profileId}`}, 0, 499)`);

    await expect(
      style.createRequest(profileId, alice, { currentPhotoId: current.id, referencePhotoIds: [ref.id] }, 's'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await db.select().from(run)).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('render', () => {
  it('replays a recorded preview, spends nothing and finishes the run', async () => {
    const made = await request(1);
    await record(made.current.id, made.refs[0]?.id ?? '');
    const fetch = vi.spyOn(globalThis, 'fetch');

    await renderer.render(made.runId);

    const [row] = await db.select().from(run).where(eq(run.id, made.runId));
    expect(row).toMatchObject({ status: 'done', stopReason: 'stopped_complete' });
    expect(fetch).not.toHaveBeenCalled();
    const view = await style.request(made.requestId, alice);
    expect(view.items[0]?.preview).toMatchObject({ saved: false });
    expect((await db.select().from(ledgerEntry)).every((e) => e.kind === 'reserve' || e.units === 0)).toBe(true);
  });

  it('fails closed with no network and no spend when nothing was recorded', async () => {
    const made = await request(2);
    const fetch = vi.spyOn(globalThis, 'fetch');

    await renderer.render(made.runId);

    const [row] = await db.select().from(run).where(eq(run.id, made.runId));
    expect(row).toMatchObject({ status: 'failed', stopReason: 'not_recorded' });
    expect(fetch).not.toHaveBeenCalled();
    expect(await db.select().from(stylePreview)).toHaveLength(0);
    expect((await db.select().from(ledgerEntry)).filter((e) => e.kind === 'settle' && e.units > 0)).toHaveLength(0);
    const lines = await db.select().from(traceEntry).where(eq(traceEntry.runId, made.runId));
    // Noted once for the references, then again as the reason the run stopped.
    expect(lines.filter((l) => l.step === 'act' && l.reason === 'not_recorded')).toHaveLength(1);
    expect(lines.at(-1)).toMatchObject({ step: 'stop', reason: 'not_recorded' });
  });

  it('still shows the recorded reference when another one is missing', async () => {
    const made = await request(2);
    await record(made.current.id, made.refs[1]?.id ?? '');

    await renderer.render(made.runId);

    const view = await style.request(made.requestId, alice);
    expect(view.items.map((i) => i.preview !== null)).toEqual([false, true]);
    const [row] = await db.select().from(run).where(eq(run.id, made.runId));
    expect(row?.status).toBe('done');
  });

  it('does nothing for a run that already finished', async () => {
    const made = await request(1);
    await db.update(run).set({ status: 'done' }).where(eq(run.id, made.runId));
    await renderer.render(made.runId);
    expect(await db.select().from(traceEntry)).toHaveLength(0);
  });
});

describe('saving', () => {
  it('saves and unsaves a preview for its owner only', async () => {
    const made = await request(1);
    await record(made.current.id, made.refs[0]?.id ?? '');
    await renderer.render(made.runId);
    const previewId = (await style.request(made.requestId, alice)).items[0]?.preview?.id ?? '';

    await expect(style.setSaved(previewId, bob, true)).rejects.toBeInstanceOf(NotFoundException);
    await style.setSaved(previewId, alice, true);
    expect((await style.saved(made.profileId, alice)).previews).toHaveLength(1);
    await style.setSaved(previewId, alice, false);
    expect((await style.saved(made.profileId, alice)).previews).toHaveLength(0);
  });

  it('answers 404 for a request that belongs to someone else', async () => {
    const made = await request(1);
    await expect(style.request(made.requestId, bob)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('removePhoto', () => {
  it('deletes the file and the previews made from it', async () => {
    const made = await request(1);
    const refId = made.refs[0]?.id ?? '';
    await record(made.current.id, refId);
    await renderer.render(made.runId);
    const before = storage.objects.size;

    await style.removePhoto(made.profileId, refId, alice);

    expect(storage.objects.size).toBe(before - 2);
    expect(await db.select().from(stylePreview)).toHaveLength(0);
  });
});

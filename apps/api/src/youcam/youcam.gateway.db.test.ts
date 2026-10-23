import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Db, budgetCounter, callCache, ledgerEntry, profile, run, snapshot, youcamTask } from '@interim/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../ledger/ledger.service';
import type { ProfilesService } from '../profiles/profiles.service';
import { MemoryStorage } from '../test/memory-storage';
import { texturedJpeg } from '../test/photos';
import { createTestDb } from '../test/test-db';
import { writeYoucamFixture } from '../test/youcam-fixtures';
import { YoucamClient } from './youcam.client';
import { type CallContext, YoucamGateway, youcamFixtureKey } from './youcam.gateway';

const profileId = '3f2b8a0e-7c2d-4a39-9d57-0d7a6a1f2b11';
const snapshotId = '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b';
const runId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const photoKey = `photos/${profileId}/${snapshotId}/front.jpg`;
const sha = 'a'.repeat(64);
const bodyFor = (ids: string[]) => ({ src_file_id: ids[0] ?? '' });
const density = { hair_density: { mapping: '1.50', term: 'Medium Density' as const } };

let db: Db;
let dir: string;
let storage: MemoryStorage;
let client: YoucamClient;
let gateway: YoucamGateway;
let ledger: LedgerService;
let photo: Buffer;

beforeAll(async () => {
  db = await createTestDb();
  photo = await texturedJpeg();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile, budget_counter, ledger_entry cascade`);
  await db.insert(profile).values({ id: profileId, templateKey: 'hair_loss_ahead', ownerRef: 'o', consentVersion: '4' });
  await db.insert(snapshot).values({ id: snapshotId, profileId });
  await db.insert(run).values({ id: runId, snapshotId, templateKey: 'hair_loss_ahead', templateVersion: 1, budgetUnits: 50 });
  dir = await mkdtemp(path.join(tmpdir(), 'youcam-'));
  storage = new MemoryStorage();
  await storage.put(photoKey, photo);
  client = new YoucamClient({ apiKey: '', baseUrl: 'https://youcam.test', mode: 'replay', liveCallsEnabled: false, fixturesDir: dir, retryBaseMs: 0 });
  ledger = new LedgerService(db, { perProfile: 500, perDay: 2000, perSourcePerDay: 100 }, {} as ProfilesService);
  gateway = new YoucamGateway(db, client, storage.asService(), ledger, { firstPollMs: 0, maxPollMs: 0, timeoutMs: 1000 });
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => rm(dir, { recursive: true, force: true }));

const context = (over: Partial<CallContext> = {}): CallContext => ({
  profileId,
  runId,
  runBudgetUnits: 50,
  photos: [{ objectKey: photoKey, sha256: sha }],
  ...over,
});
const keyOf = (tool: Parameters<typeof youcamFixtureKey>[1], params = {}) => youcamFixtureKey([sha], tool, params);
const measure = (over: Partial<CallContext> = {}) => gateway.measure(context(over), 'hair_density', {}, bodyFor);

describe('measure', () => {
  it('replays a recorded result, charges nothing and leaves a settled ledger row', async () => {
    await writeYoucamFixture(dir, 'hair_density', keyOf('hair_density'), { results: density });
    const fetch = vi.spyOn(globalThis, 'fetch');

    const outcome = await measure();

    expect(outcome).toMatchObject({ kind: 'result', reused: false, units: 0, result: density });
    expect(fetch).not.toHaveBeenCalled();
    const entries = await db.select().from(ledgerEntry);
    expect(entries.map((e) => [e.kind, e.units])).toEqual([['reserve', 1], ['settle', 0]]);
    expect((await db.select().from(youcamTask))[0]?.state).toBe('done');
  });

  it('reuses a recorded result for the same picture and request, with no second call (acceptance 2)', async () => {
    const key = keyOf('hair_density');
    await writeYoucamFixture(dir, 'hair_density', key, { results: density });
    await measure();
    await rm(path.join(dir, 'hair_density'), { recursive: true });
    const create = vi.spyOn(client, 'createTask');

    const again = await measure();

    expect(again).toMatchObject({ kind: 'result', reused: true, taskId: null, units: 0, result: density });
    expect(create).not.toHaveBeenCalled();
    expect(await db.select().from(youcamTask)).toHaveLength(1);
    expect(await db.select().from(ledgerEntry)).toHaveLength(2);
  });

  it('does not share a result between profiles', async () => {
    await writeYoucamFixture(dir, 'hair_density', keyOf('hair_density'), { results: density });
    await measure();
    const [row] = await db.select().from(callCache);
    expect(row?.key.startsWith(`${profileId}:hair_density:`)).toBe(true);
  });

  it('asks for a new photo when YouCam answers with an angle error inside HTTP 200, and charges nothing (acceptance 9)', async () => {
    await writeYoucamFixture(dir, 'hair_density', keyOf('hair_density'), { error: 'error_face_angle_invalid' });

    expect(await measure()).toEqual({ kind: 'retake', problem: 'retake_angle' });

    const [counter] = await db.select().from(budgetCounter).where(eq(budgetCounter.scope, `run:${runId}`));
    expect(counter).toMatchObject({ reservedUnits: 0, settledUnits: 0 });
    expect((await db.select().from(youcamTask))[0]?.state).toBe('failed');
    expect(await db.select().from(callCache)).toEqual([]);
  });

  it('caches a blocked tool so it is never asked again (acceptance 3)', async () => {
    await writeYoucamFixture(dir, 'hair_density', keyOf('hair_density'), { error: 'error_hair_too_short' });
    expect(await measure()).toEqual({ kind: 'blocked', reason: 'blocked_tool' });
    await rm(path.join(dir, 'hair_density'), { recursive: true });
    expect(await measure()).toEqual({ kind: 'blocked', reason: 'blocked_tool' });
  });

  it('fails closed when nothing was recorded, with no network call and the units released (acceptance 6)', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');

    expect(await measure()).toEqual({ kind: 'not_recorded' });

    expect(fetch).not.toHaveBeenCalled();
    const [counter] = await db.select().from(budgetCounter).where(eq(budgetCounter.scope, `run:${runId}`));
    expect(counter?.reservedUnits).toBe(0);
    expect((await db.select().from(ledgerEntry)).map((e) => e.kind)).toEqual(['reserve', 'release']);
  });

  it('is blocked, with no task row, when the call would pass the run cap', async () => {
    await writeYoucamFixture(dir, 'hair_density', keyOf('hair_density'), { results: density });
    expect(await measure({ runBudgetUnits: 0 })).toEqual({ kind: 'blocked', reason: 'blocked_budget' });
    expect(await db.select().from(youcamTask)).toEqual([]);
  });

  it('is blocked when the photo has expired', async () => {
    storage.objects.delete(photoKey);
    expect(await measure()).toEqual({ kind: 'blocked', reason: 'blocked_photo' });
    const [counter] = await db.select().from(budgetCounter).where(eq(budgetCounter.scope, `run:${runId}`));
    expect(counter?.reservedUnits).toBe(0);
  });

  it('never sends a second create after a crash between the task row and the YouCam id (acceptance 13)', async () => {
    const key = keyOf('hair_density');
    const taskId = '11111111-2222-4333-8444-555555555555';
    await ledger.reserve({ profileId, runId, runBudgetUnits: 50, taskId, tool: 'hair_density', units: 1 });
    await db.insert(youcamTask).values({ id: taskId, profileId, runId, tool: 'hair_density', cacheKey: key, state: 'intent' });
    await writeYoucamFixture(dir, 'hair_density', key, { results: density });
    const create = vi.spyOn(client, 'createTask');

    expect(await measure()).toEqual({ kind: 'stop', reason: 'stopped_error' });

    expect(create).not.toHaveBeenCalled();
    expect((await db.select().from(youcamTask))[0]?.state).toBe('unknown');
    const [counter] = await db.select().from(budgetCounter).where(eq(budgetCounter.scope, `run:${runId}`));
    expect(counter?.reservedUnits).toBe(1); // held until the task is reconciled
  });

  it('polls a task that was already created instead of creating another', async () => {
    const key = keyOf('hair_density');
    const taskId = '11111111-2222-4333-8444-555555555555';
    await ledger.reserve({ profileId, runId, runBudgetUnits: 50, taskId, tool: 'hair_density', units: 1 });
    await db.insert(youcamTask).values({ id: taskId, profileId, runId, tool: 'hair_density', cacheKey: key, state: 'created', youcamTaskId: `replay:${key}` });
    await writeYoucamFixture(dir, 'hair_density', key, { results: density });
    const create = vi.spyOn(client, 'createTask');

    expect(await measure()).toMatchObject({ kind: 'result', result: density });

    expect(create).not.toHaveBeenCalled();
    expect((await db.select().from(ledgerEntry)).map((e) => e.kind)).toEqual(['reserve', 'settle']);
  });
});

describe('trying again', () => {
  it('asks again for a call that failed before anything was created, once it can be answered', async () => {
    expect(await measure()).toEqual({ kind: 'not_recorded' });
    await writeYoucamFixture(dir, 'hair_density', keyOf('hair_density'), { results: density });

    expect(await measure()).toMatchObject({ kind: 'result', result: density });

    const kinds = (await db.select().from(ledgerEntry)).map((e) => e.kind).sort();
    expect(kinds).toEqual(['release', 'reserve', 'reserve', 'settle']);
    const [counter] = await db.select().from(budgetCounter).where(eq(budgetCounter.scope, `run:${runId}`));
    expect(counter?.reservedUnits).toBe(0);
  });
});

describe('render', () => {
  const imageKey = `renders/${profileId}/${snapshotId}/a.jpg`;
  const params = { template: 'male_short_curly' };
  const body = (ids: string[]) => ({ src_file_id: ids[0] ?? '', template_id: 'male_short_curly', hair_color: 'src' as const });
  const make = (key = imageKey) => gateway.render(context(), 'hairstyle', key, params, body);

  it('stores the recorded image and records it as the cache result', async () => {
    const image = await texturedJpeg(100, 100);
    await writeYoucamFixture(dir, 'hairstyle', keyOf('hairstyle', params), { results: { url: 'https://example.test/r.jpg' } }, image);

    expect(await make()).toMatchObject({ kind: 'image', objectKey: imageKey, reused: false });

    expect(storage.objects.get(imageKey)?.body.equals(image)).toBe(true);
    expect((await db.select().from(callCache))[0]?.resultRef).toBe(imageKey);
  });

  it('copies a recorded image to the new snapshot’s key instead of asking again', async () => {
    const image = await texturedJpeg(100, 100);
    await writeYoucamFixture(dir, 'hairstyle', keyOf('hairstyle', params), { results: { url: 'https://example.test/r.jpg' } }, image);
    await make();
    await rm(path.join(dir, 'hairstyle'), { recursive: true });
    const other = `renders/${profileId}/other/b.jpg`;

    expect(await make(other)).toMatchObject({ kind: 'image', objectKey: other, reused: true });

    expect(storage.objects.get(other)?.body.equals(image)).toBe(true);
    expect(storage.objects.has(imageKey)).toBe(true);
  });

  it('fails closed when the recorded result has no image, and holds no units', async () => {
    await writeYoucamFixture(dir, 'hairstyle', keyOf('hairstyle', params), { results: { url: 'https://example.test/r.jpg' } });

    expect(await make()).toEqual({ kind: 'not_recorded' });

    const [counter] = await db.select().from(budgetCounter).where(eq(budgetCounter.scope, `run:${runId}`));
    expect(counter?.reservedUnits).toBe(0);
    expect(storage.objects.has(imageKey)).toBe(false);
  });
});

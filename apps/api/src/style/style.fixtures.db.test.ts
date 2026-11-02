import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type Db, ledgerEntry, profile, run } from '@interim/db';
import { CONSENT_VERSION } from '@interim/rules';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../ledger/ledger.service';
import type { ProfilesService } from '../profiles/profiles.service';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { YoucamClient } from '../youcam/youcam.client';
import { YoucamGateway } from '../youcam/youcam.gateway';
import { StyleRenderService } from './style-render.service';
import { sampleSets } from './style-samples';
import { StyleService } from './style.service';

const fixtures = path.resolve(__dirname, '../../../../packages/fixtures');
const owner = { ref: 'alice' };

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

/** The real services in replay mode over the committed recordings, with nothing to reach the network. */
async function setup() {
  await db.execute(sql`truncate profile, budget_counter, ledger_entry cascade`);
  const storage = new MemoryStorage();
  const ledger = new LedgerService(db, { perProfile: 500, perDay: 2000, perSourcePerDay: 100 }, {} as ProfilesService);
  const client = new YoucamClient({
    apiKey: '',
    baseUrl: 'https://youcam.test',
    mode: 'replay',
    liveCallsEnabled: false,
    fixturesDir: path.join(fixtures, 'youcam'),
    retryBaseMs: 0,
  });
  const gateway = new YoucamGateway(db, client, storage.asService(), ledger, { firstPollMs: 0, maxPollMs: 0, timeoutMs: 1000 });
  const enqueue = vi.fn(() => Promise.resolve());
  const style = new StyleService(db, storage.asService(), ledger, { enqueue }, { runBudgetCap: 50 }, { maxUploadBytes: 12 * 1024 * 1024 }, {
    dir: path.join(fixtures, 'own'),
    sets: sampleSets,
  });
  const renderer = new StyleRenderService(db, gateway, ledger);
  const profileId = randomUUID();
  await db.insert(profile).values({ id: profileId, kind: 'style', templateKey: null, ownerRef: owner.ref, consentVersion: CONSENT_VERSION, consentedAt: new Date() });
  const add = async (file: string, role: 'current' | 'reference') => {
    const uploadId = randomUUID();
    await storage.put(`raw/${profileId}/${uploadId}`, await readFile(path.join(fixtures, file)));
    return style.addPhoto(profileId, owner, { uploadId, role });
  };
  return { style, renderer, profileId, add };
}

/** Renders one request and checks every reference got a preview with no network and no spend. */
async function expectAllRecorded(
  env: Awaited<ReturnType<typeof setup>>,
  currentPhotoId: string,
  referencePhotoIds: string[],
) {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const made = await env.style.createRequest(env.profileId, owner, { currentPhotoId, referencePhotoIds }, 's');
  await env.renderer.render(made.runId);
  const view = await env.style.request(made.requestId, owner);
  expect(view.items.map((i) => i.preview !== null)).toEqual(referencePhotoIds.map(() => true));
  expect((await db.select().from(run).where(eq(run.id, made.runId)))[0]?.status).toBe('done');
  expect(fetch).not.toHaveBeenCalled();
  expect((await db.select().from(ledgerEntry)).filter((e) => e.kind === 'settle').every((e) => e.units === 0)).toBe(true);
  fetch.mockRestore();
}

// Each case uploads the repository's synthetic photos the way a person would. If a key stops
// matching, a preview silently turns into "not recorded", so this guards the recordings from drift.
describe('committed style fixtures', () => {
  const outfits = ['tracksuit', 'layered-streetwear', 'smart-casual'];
  const newOutfits = ['denim', 'earth-tones', 'monochrome'];
  const cases: [string, string, string[]][] = [
    ['man, photo 1, first outfits', 'own/b/body-1.jpg', outfits],
    ['man, photo 2, first outfits', 'own/b/body-2.jpg', outfits],
    ['man, photo 1, new outfits', 'own/b/body-1.jpg', newOutfits],
    ['woman, new outfits', 'own/style/current-woman.jpg', newOutfits],
  ];

  it.each(cases)('replays every recorded outfit for %s', async (_name, currentFile, names) => {
    const env = await setup();
    const current = await env.add(currentFile, 'current');
    const refs = await Promise.all(names.map((n) => env.add(`own/style/${n}.jpg`, 'reference')));
    await expectAllRecorded(env, current.id, refs.map((r) => r.id));
  });

  it.each(['one', 'two'] as const)('adds sample set %s with a current photo and three outfits, and its previews replay', async (set) => {
    const env = await setup();
    const { photos } = await env.style.addSamples(env.profileId, owner, { set });

    expect(photos.map((p) => p.role)).toEqual(['reference', 'reference', 'reference', 'current']);
    await expectAllRecorded(env, photos[3]?.id ?? '', photos.slice(0, 3).map((p) => p.id));
    // Adding the set again stores nothing new.
    const again = await env.style.addSamples(env.profileId, owner, { set });
    expect(again.photos.map((p) => p.id)).toEqual(photos.map((p) => p.id));
  });
});

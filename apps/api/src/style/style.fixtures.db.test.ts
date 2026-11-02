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
import { StyleService } from './style.service';

const fixtures = path.resolve(__dirname, '../../../../packages/fixtures');
const owner = { ref: 'alice' };
const references = ['tracksuit', 'layered-streetwear', 'smart-casual'];

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

describe('committed style fixtures', () => {
  // Uploads the repository's synthetic photos the way a person would. If a key stops matching, the
  // preview silently turns into "not recorded", so this guards the recordings against drift.
  it.each([1, 2])('replays every recorded reference on body photo %i with no network and no spend', async (n) => {
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
    const style = new StyleService(db, storage.asService(), ledger, { enqueue }, { runBudgetCap: 50 }, { maxUploadBytes: 12 * 1024 * 1024 });
    const renderer = new StyleRenderService(db, gateway, ledger);
    const fetch = vi.spyOn(globalThis, 'fetch');

    const profileId = randomUUID();
    await db.insert(profile).values({ id: profileId, kind: 'style', templateKey: null, ownerRef: owner.ref, consentVersion: CONSENT_VERSION, consentedAt: new Date() });
    const add = async (file: string, role: 'current' | 'reference') => {
      const uploadId = randomUUID();
      await storage.put(`raw/${profileId}/${uploadId}`, await readFile(path.join(fixtures, file)));
      return style.addPhoto(profileId, owner, { uploadId, role });
    };
    const current = await add(`own/b/body-${n}.jpg`, 'current');
    const refs = await Promise.all(references.map((name) => add(`own/style/${name}.jpg`, 'reference')));

    const made = await style.createRequest(profileId, owner, { currentPhotoId: current.id, referencePhotoIds: refs.map((r) => r.id) }, 's');
    await renderer.render(made.runId);

    const view = await style.request(made.requestId, owner);
    expect(view.items.map((i) => i.preview !== null)).toEqual([true, true, true]);
    expect((await db.select().from(run).where(eq(run.id, made.runId)))[0]?.status).toBe('done');
    expect(fetch).not.toHaveBeenCalled();
    expect((await db.select().from(ledgerEntry)).filter((e) => e.kind === 'settle').every((e) => e.units === 0)).toBe(true);
  });
});

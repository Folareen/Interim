import { randomUUID } from 'node:crypto';
import { type Db, profile, run, snapshot, stylePhoto, styleRequest } from '@interim/db';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentService } from '../agent/agent.service';
import type { StyleRenderService } from '../style/style-render.service';
import { createTestDb } from '../test/test-db';
import type { ProfileLock } from './profile-lock';
import { RunWorker } from './run.worker';

let db: Db;
const agent = { run: vi.fn(() => Promise.resolve()) };
const style = { render: vi.fn(() => Promise.resolve()) };
// Runs the work at once, as an idle profile lock would, so the dispatch can be tested without Redis.
const lock = {
  run: vi.fn(async (_profileId: string, work: () => Promise<unknown>) => ({ kind: 'done' as const, value: await work() })),
};

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile cascade`);
  vi.clearAllMocks();
});

const worker = () =>
  new RunWorker(agent as unknown as AgentService, style as unknown as StyleRenderService, 'redis://unused', db, lock as unknown as ProfileLock);

describe('RunWorker.process', () => {
  it('sends a check in run to the agent, locked on its profile', async () => {
    const profileId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();
    await db.insert(profile).values({ id: profileId, templateKey: 'going_grey', ownerRef: 'o', consentVersion: '5' });
    await db.insert(snapshot).values({ id: snapshotId, profileId });
    await db.insert(run).values({ id: runId, snapshotId, templateKey: 'going_grey', templateVersion: 1, budgetUnits: 50 });

    expect(await worker().process(runId)).toBe('done');

    expect(lock.run).toHaveBeenCalledWith(profileId, expect.any(Function));
    expect(agent.run).toHaveBeenCalledExactlyOnceWith(runId);
    expect(style.render).not.toHaveBeenCalled();
  });

  it('sends a style run to the style renderer, locked on its profile', async () => {
    const profileId = randomUUID();
    const photoId = randomUUID();
    const requestId = randomUUID();
    const runId = randomUUID();
    await db.insert(profile).values({ id: profileId, kind: 'style', templateKey: null, ownerRef: 'o', consentVersion: '5' });
    await db.insert(stylePhoto).values({ id: photoId, profileId, role: 'current', objectKey: 'k', sha256: 'h', expiresAt: new Date() });
    await db.insert(styleRequest).values({ id: requestId, profileId, currentPhotoId: photoId });
    await db.insert(run).values({ id: runId, styleRequestId: requestId, budgetUnits: 4 });

    expect(await worker().process(runId)).toBe('done');

    expect(lock.run).toHaveBeenCalledWith(profileId, expect.any(Function));
    expect(style.render).toHaveBeenCalledExactlyOnceWith(runId);
    expect(agent.run).not.toHaveBeenCalled();
  });

  it('reports a busy profile without running anything', async () => {
    const profileId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();
    await db.insert(profile).values({ id: profileId, templateKey: 'going_grey', ownerRef: 'o', consentVersion: '5' });
    await db.insert(snapshot).values({ id: snapshotId, profileId });
    await db.insert(run).values({ id: runId, snapshotId, templateKey: 'going_grey', templateVersion: 1, budgetUnits: 50 });
    lock.run.mockResolvedValueOnce({ kind: 'busy' } as never);

    expect(await worker().process(runId)).toBe('busy');
    expect(agent.run).not.toHaveBeenCalled();
  });
});

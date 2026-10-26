import { type Db, budgetCounter, ledgerEntry, profile, run, snapshot, youcamTask } from '@interim/db';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LedgerService } from '../ledger/ledger.service';
import type { ProfilesService } from '../profiles/profiles.service';
import { createTestDb } from '../test/test-db';
import { TaskReconciler } from './task-reconciler';

const HOUR = 60 * 60 * 1000;
const profileId = '3f2b8a0e-7c2d-4a39-9d57-0d7a6a1f2b11';
const snapshotId = '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b';
const runId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const now = new Date('2026-10-26T12:00:00Z');

let db: Db;
let ledger: LedgerService;
let reconciler: TaskReconciler;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile, budget_counter, ledger_entry cascade`);
  await db.insert(profile).values({ id: profileId, templateKey: 'going_grey', ownerRef: 'o', consentVersion: '1' });
  await db.insert(snapshot).values({ id: snapshotId, profileId });
  await db.insert(run).values({ id: runId, snapshotId, templateKey: 'going_grey', templateVersion: 1, budgetUnits: 50, sourceHash: 'src' });
  ledger = new LedgerService(db, { perProfile: 500, perDay: 2000, perSourcePerDay: 100 }, {} as ProfilesService);
  reconciler = new TaskReconciler(db, ledger);
});

/** A task with units held, last touched `ageHours` before `now`. */
async function openTask(state: 'intent' | 'created' | 'unknown' | 'done', ageHours: number, units = 2) {
  const id = crypto.randomUUID();
  await ledger.reserve({ profileId, runId, runBudgetUnits: 50, sourceHash: 'src', taskId: id, tool: 'hair_length', units, now });
  await db.insert(youcamTask).values({ id, profileId, runId, tool: 'hair_length', cacheKey: id, state, updatedAt: new Date(now.getTime() - ageHours * HOUR) });
  return id;
}
const counter = async (scope: string) => (await db.select().from(budgetCounter).where(eq(budgetCounter.scope, scope)))[0];

describe('reconcile', () => {
  it('settles a task left unknown for a day at its full price, so the units are not held for ever', async () => {
    await openTask('unknown', 25, 2);

    expect(await reconciler.reconcile(now)).toBe(1);

    for (const scope of [`run:${runId}`, `profile:${profileId}`, 'source:src:2026-10-26']) {
      expect(await counter(scope)).toMatchObject({ reservedUnits: 0, settledUnits: 2 });
    }
  });

  it('also closes a create that crashed before it was marked, and a poll that timed out', async () => {
    await openTask('intent', 30);
    await openTask('created', 48);

    expect(await reconciler.reconcile(now)).toBe(2);

    expect(await counter(`run:${runId}`)).toMatchObject({ reservedUnits: 0, settledUnits: 4 });
  });

  it('leaves a recent unknown task held, because it may still be resolved', async () => {
    await openTask('unknown', 23);

    expect(await reconciler.reconcile(now)).toBe(0);

    expect(await counter(`run:${runId}`)).toMatchObject({ reservedUnits: 2, settledUnits: 0 });
  });

  it('leaves a finished task alone and counts a task once however often it runs', async () => {
    const done = await openTask('done', 100);
    await ledger.settle({ profileId, runId, runBudgetUnits: 50, sourceHash: 'src', taskId: done }, 0);
    await openTask('unknown', 25);

    expect(await reconciler.reconcile(now)).toBe(1);
    expect(await reconciler.reconcile(now)).toBe(0);

    expect(await counter(`run:${runId}`)).toMatchObject({ reservedUnits: 0, settledUnits: 2 });
    expect((await db.select().from(ledgerEntry)).filter((e) => e.kind === 'settle')).toHaveLength(2);
  });

  it('never makes the task sendable again', async () => {
    const id = await openTask('unknown', 25);
    await reconciler.reconcile(now);

    expect((await db.select().from(youcamTask).where(eq(youcamTask.id, id)))[0]?.state).toBe('unknown');
  });
});

import { type Db, budgetCounter, ledgerEntry } from '@interim/db';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProfilesService } from '../profiles/profiles.service';
import { createTestDb } from '../test/test-db';
import { BudgetExceededError, LedgerService } from './ledger.service';

const caps = { perProfile: 500, perDay: 2000, perSourcePerDay: 100 };
const owner = { ref: 'abc' };
const profileId = '3f2b8a0e-7c2d-4a39-9d57-0d7a6a1f2b11';
const runId = '9a1c2d3e-4b5f-4a6b-8c7d-0e1f2a3b4c5d';
const context = { profileId, runId, runBudgetUnits: 50 };
const day1 = new Date('2026-10-20T23:59:00Z');

let db: Db;
let ledger: LedgerService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate ledger_entry, budget_counter`);
  const profiles = { get: () => Promise.resolve({}) } as unknown as ProfilesService;
  ledger = new LedgerService(db, caps, profiles);
});

async function counter(scope: string) {
  const [row] = await db.select().from(budgetCounter).where(eq(budgetCounter.scope, scope));
  return row ? { reserved: row.reservedUnits, settled: row.settledUnits } : undefined;
}
const entries = () => db.select().from(ledgerEntry);

describe('reserve', () => {
  it('holds the units against every scope and writes one ledger row', async () => {
    await ledger.reserve({ ...context, taskId: 't1', tool: 'hair_type', units: 2, now: day1 });

    expect(await counter(`run:${runId}`)).toEqual({ reserved: 2, settled: 0 });
    expect(await counter(`profile:${profileId}`)).toEqual({ reserved: 2, settled: 0 });
    expect(await counter('day:2026-10-20')).toEqual({ reserved: 2, settled: 0 });
    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ profileRef: profileId, runId, kind: 'reserve', units: 2, tool: 'hair_type', taskId: 't1' });
  });

  it('counts a task once however often the job retries', async () => {
    const call = { ...context, taskId: 't1', tool: 'hair_type', units: 2, now: day1 };
    await ledger.reserve(call);
    await ledger.reserve(call);
    expect(await entries()).toHaveLength(1);
    expect(await counter(`run:${runId}`)).toEqual({ reserved: 2, settled: 0 });
  });

  it('refuses a call over the run cap and leaves nothing behind', async () => {
    await ledger.reserve({ ...context, taskId: 't1', tool: 'fitzpatrick', units: 40, now: day1 });
    const attempt = ledger.reserve({ ...context, taskId: 't2', tool: 'fitzpatrick', units: 11, now: day1 });

    await expect(attempt).rejects.toThrow(BudgetExceededError);
    await expect(attempt).rejects.toMatchObject({ scope: `run:${runId}` });
    expect(await entries()).toHaveLength(1);
    expect(await counter(`run:${runId}`)).toEqual({ reserved: 40, settled: 0 });
  });

  it('counts spent units as well as held ones', async () => {
    await ledger.reserve({ ...context, taskId: 't1', tool: 'fitzpatrick', units: 30, now: day1 });
    await ledger.settle({ ...context, taskId: 't1' }, 30);
    await expect(
      ledger.reserve({ ...context, taskId: 't2', tool: 'fitzpatrick', units: 21, now: day1 }),
    ).rejects.toThrow(BudgetExceededError);
    await ledger.reserve({ ...context, taskId: 't3', tool: 'fitzpatrick', units: 20, now: day1 });
  });

  it('applies the source cap when the call has a source', async () => {
    const withSource = { ...context, runBudgetUnits: 500, sourceHash: 'abc' };
    await ledger.reserve({ ...withSource, taskId: 't1', tool: 'x', units: 90, now: day1 });
    expect(await counter('source:abc:2026-10-20')).toEqual({ reserved: 90, settled: 0 });
    await expect(ledger.reserve({ ...withSource, taskId: 't2', tool: 'x', units: 11, now: day1 })).rejects.toMatchObject({
      scope: 'source:abc:2026-10-20',
    });
  });

  it('never lets concurrent runs overspend a cap', async () => {
    const results = await Promise.allSettled(
      ['a', 'b', 'c'].map((taskId) => ledger.reserve({ ...context, taskId, tool: 'x', units: 20, now: day1 })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await counter(`run:${runId}`)).toEqual({ reserved: 40, settled: 0 });
  });
});

describe('settle and release', () => {
  beforeEach(() => ledger.reserve({ ...context, taskId: 't1', tool: 'skin', units: 10, now: day1 }));

  it('swaps the held units for the actual charge', async () => {
    await ledger.settle({ ...context, taskId: 't1' }, 4);
    expect(await counter(`profile:${profileId}`)).toEqual({ reserved: 0, settled: 4 });
    const settle = (await entries()).find((e) => e.kind === 'settle');
    expect(settle).toMatchObject({ units: 4, tool: 'skin', taskId: 't1' });
  });

  it('accepts a charge above the estimate, since the units are already spent', async () => {
    await ledger.settle({ ...context, taskId: 't1' }, 12);
    expect(await counter(`run:${runId}`)).toEqual({ reserved: 0, settled: 12 });
  });

  it('release frees the hold with no charge', async () => {
    await ledger.release({ ...context, taskId: 't1' });
    expect(await counter(`run:${runId}`)).toEqual({ reserved: 0, settled: 0 });
    expect((await entries()).find((e) => e.kind === 'release')?.units).toBe(10);
  });

  it('ends a task only once', async () => {
    await ledger.settle({ ...context, taskId: 't1' }, 4);
    await ledger.settle({ ...context, taskId: 't1' }, 4);
    await ledger.release({ ...context, taskId: 't1' });
    expect(await entries()).toHaveLength(2);
    expect(await counter(`run:${runId}`)).toEqual({ reserved: 0, settled: 4 });
  });

  it('refuses to settle a task that was never reserved', async () => {
    await expect(ledger.settle({ ...context, taskId: 'nope' }, 1)).rejects.toThrow(/No reservation/);
  });

  it('settles against the day counters it was reserved on, even after midnight', async () => {
    await ledger.settle({ ...context, taskId: 't1' }, 10);
    expect(await counter('day:2026-10-20')).toEqual({ reserved: 0, settled: 10 });
    expect(await counter('day:2026-10-21')).toBeUndefined();
  });
});

describe('list', () => {
  it('returns the profile rows and totals', async () => {
    await ledger.reserve({ ...context, taskId: 't1', tool: 'skin', units: 10, now: day1 });
    await ledger.reserve({ ...context, taskId: 't2', tool: 'hair_type', units: 2, now: day1 });
    await ledger.settle({ ...context, taskId: 't1' }, 9);

    const result = await ledger.list(profileId, owner);
    expect(result.entries.map((e) => e.kind).sort()).toEqual(['reserve', 'reserve', 'settle']);
    expect(result.totals).toEqual({ reservedUnits: 2, settledUnits: 9 });
  });

  it('shows zero totals before any call', async () => {
    expect((await ledger.list(profileId, owner)).totals).toEqual({ reservedUnits: 0, settledUnits: 0 });
  });
});

import { type Db, budgetCounter, ledgerEntry } from '@interim/db';
import { type BudgetCaps, type BudgetContext, budgetScopes, fitsCap } from '@interim/rules';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { ProfilesService } from '../profiles/profiles.service';

export const LEDGER_CAPS = Symbol('LEDGER_CAPS');

/** Thrown by `reserve` when a call would push a counter over its cap. The caller marks the tool blocked. */
export class BudgetExceededError extends Error {
  constructor(readonly scope: string) {
    super(`Budget exceeded for ${scope}`);
  }
}

/** The call a reservation is for. `taskId` is the `youcam_task.id` the caller generated, which makes every step idempotent. */
export type LedgerCall = BudgetContext & { taskId: string };

/** A call plus what to hold for it: the tool, the units and, in tests, the time. */
export type ReserveInput = LedgerCall & { tool: string; units: number; now?: Date };

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Append only unit ledger and budget counters (docs/product/spec.md section 10). Each step runs in
 * one transaction that locks the counter rows of every scope in key order, so concurrent runs
 * cannot overspend a cap. Entries are never updated or deleted.
 */
@Injectable()
export class LedgerService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(LEDGER_CAPS) private readonly caps: BudgetCaps,
    @Inject(ProfilesService) private readonly profiles: ProfilesService,
  ) {}

  /**
   * Holds `units` against every cap that applies. Calling it again for the same task changes nothing.
   * @throws BudgetExceededError naming the first scope that cannot fit the units.
   */
  async reserve(input: ReserveInput): Promise<void> {
    const now = input.now ?? new Date();
    const scopes = budgetScopes(input, this.caps, dayOf(now));
    await this.db.transaction(async (tx) => {
      const counters = await lockCounters(tx, scopes.map((s) => s.key));
      const [existing] = await tx
        .select({ id: ledgerEntry.id })
        .from(ledgerEntry)
        .where(and(eq(ledgerEntry.taskId, input.taskId), eq(ledgerEntry.kind, 'reserve')));
      if (existing) return;

      for (const { key, cap } of scopes) {
        const counter = counters.get(key);
        if (!counter || !fitsCap(counter, input.units, cap)) throw new BudgetExceededError(key);
      }
      await tx.insert(ledgerEntry).values({
        profileRef: input.profileId,
        runId: input.runId,
        tool: input.tool,
        kind: 'reserve',
        units: input.units,
        taskId: input.taskId,
        createdAt: now,
      });
      await tx
        .update(budgetCounter)
        .set({ reservedUnits: sql`${budgetCounter.reservedUnits} + ${input.units}` })
        .where(inArray(budgetCounter.scope, scopes.map((s) => s.key)));
    });
  }

  /**
   * Ends a reservation at the units actually charged, which may be zero or more than was held.
   * Does nothing if the task was already settled or released.
   * @throws Error when the task has no reservation.
   */
  settle(call: LedgerCall, actualUnits: number): Promise<void> {
    return this.close('settle', call, actualUnits);
  }

  /** Ends a reservation without a charge. Does nothing if the task was already settled or released. */
  release(call: LedgerCall): Promise<void> {
    return this.close('release', call, 0);
  }

  /**
   * Units left under the tightest cap that applies to a call, so the agent can plan within it. An
   * estimate for planning: `reserve` is what enforces the caps, under a lock.
   */
  async remaining(context: BudgetContext, now = new Date()): Promise<number> {
    const scopes = budgetScopes(context, this.caps, dayOf(now));
    const rows = await this.db
      .select()
      .from(budgetCounter)
      .where(inArray(budgetCounter.scope, scopes.map((s) => s.key)));
    const byScope = new Map(rows.map((row) => [row.scope, row]));
    return Math.min(
      ...scopes.map(({ key, cap }) => cap - (byScope.get(key)?.reservedUnits ?? 0) - (byScope.get(key)?.settledUnits ?? 0)),
    );
  }

  /** The caller's own ledger rows and the profile's held and spent totals. */
  async list(profileId: string, owner: Owner) {
    await this.profiles.get(profileId, owner);
    const entries = await this.db
      .select({
        id: ledgerEntry.id,
        runId: ledgerEntry.runId,
        taskId: ledgerEntry.taskId,
        tool: ledgerEntry.tool,
        kind: ledgerEntry.kind,
        units: ledgerEntry.units,
        createdAt: ledgerEntry.createdAt,
      })
      .from(ledgerEntry)
      .where(eq(ledgerEntry.profileRef, profileId))
      .orderBy(desc(ledgerEntry.createdAt));
    const [counter] = await this.db
      .select({ reservedUnits: budgetCounter.reservedUnits, settledUnits: budgetCounter.settledUnits })
      .from(budgetCounter)
      .where(eq(budgetCounter.scope, `profile:${profileId}`));
    return { entries, totals: counter ?? { reservedUnits: 0, settledUnits: 0 } };
  }

  private async close(kind: 'settle' | 'release', call: LedgerCall, actualUnits: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      // The reserve row never changes, so reading it before the locks is safe. Its date keeps a
      // task that settles after midnight on the day counters it was reserved against.
      const [reserved] = await tx
        .select({ units: ledgerEntry.units, tool: ledgerEntry.tool, createdAt: ledgerEntry.createdAt })
        .from(ledgerEntry)
        .where(and(eq(ledgerEntry.taskId, call.taskId), eq(ledgerEntry.kind, 'reserve')));
      if (!reserved) throw new Error(`No reservation for task ${call.taskId}`);

      const keys = budgetScopes(call, this.caps, dayOf(reserved.createdAt)).map((s) => s.key);
      await lockCounters(tx, keys);
      const [ended] = await tx
        .select({ id: ledgerEntry.id })
        .from(ledgerEntry)
        .where(and(eq(ledgerEntry.taskId, call.taskId), inArray(ledgerEntry.kind, ['settle', 'release'])));
      if (ended) return;

      await tx.insert(ledgerEntry).values({
        profileRef: call.profileId,
        runId: call.runId,
        tool: reserved.tool,
        kind,
        units: kind === 'settle' ? actualUnits : reserved.units,
        taskId: call.taskId,
      });
      await tx
        .update(budgetCounter)
        .set({
          reservedUnits: sql`${budgetCounter.reservedUnits} - ${reserved.units}`,
          settledUnits: sql`${budgetCounter.settledUnits} + ${actualUnits}`,
        })
        .where(inArray(budgetCounter.scope, keys));
    });
  }
}

/** Creates any missing counter rows, then locks them all in key order. */
async function lockCounters(tx: Tx, keys: string[]) {
  await tx
    .insert(budgetCounter)
    .values(keys.map((scope) => ({ scope })))
    .onConflictDoNothing();
  const rows = await tx
    .select()
    .from(budgetCounter)
    .where(inArray(budgetCounter.scope, keys))
    .orderBy(budgetCounter.scope)
    .for('update');
  return new Map(rows.map((row) => [row.scope, row]));
}

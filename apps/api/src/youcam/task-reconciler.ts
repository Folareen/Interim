import { type Db, ledgerEntry, run, youcamTask } from '@interim/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { alias } from 'drizzle-orm/pg-core';
import { and, eq, inArray, lte, notExists, sql } from 'drizzle-orm';
import { DB } from '../db/db.token';
import { LedgerService } from '../ledger/ledger.service';
import { youcamRetentionSeconds } from './youcam.constants';

const BATCH = 200;

/**
 * Closes the reservations of tasks that never reached a final state (docs/product/spec.md section
 * 10). YouCam has no idempotency key and no way to list tasks, so Interim cannot learn whether an
 * `unknown` create happened. Nothing is sent again; once the task's 24 hours at YouCam are over,
 * the reservation is settled at its full price, because over-counting a cap is safer than
 * under-counting money spent.
 */
@Injectable()
export class TaskReconciler {
  private readonly log = new Logger(TaskReconciler.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(LedgerService) private readonly ledger: LedgerService,
  ) {}

  /**
   * Settles every open task last touched more than 24 hours ago. A task still `created` is included:
   * a poll that timed out leaves it there, and YouCam charges a task that times out.
   * @returns How many reservations were closed.
   */
  async reconcile(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - youcamRetentionSeconds * 1000);
    const ended = alias(ledgerEntry, 'ended');
    let closed = 0;
    for (;;) {
      const open = await this.db
        .select({
          id: youcamTask.id,
          tool: youcamTask.tool,
          state: youcamTask.state,
          profileId: youcamTask.profileId,
          runId: ledgerEntry.runId,
          units: ledgerEntry.units,
          sourceHash: run.sourceHash,
        })
        .from(youcamTask)
        .innerJoin(ledgerEntry, and(eq(ledgerEntry.taskId, sql`${youcamTask.id}::text`), eq(ledgerEntry.kind, 'reserve')))
        .leftJoin(run, eq(run.id, ledgerEntry.runId))
        .where(
          and(
            inArray(youcamTask.state, ['intent', 'created', 'unknown']),
            lte(youcamTask.updatedAt, cutoff),
            notExists(
              this.db
                .select({ one: sql`1` })
                .from(ended)
                .where(and(eq(ended.taskId, sql`${youcamTask.id}::text`), inArray(ended.kind, ['settle', 'release']))),
            ),
          ),
        )
        .limit(BATCH);
      let closedInBatch = 0;
      for (const task of open) {
        // The reserve row keeps the run id after the run is gone, which is the counter that holds the units.
        if (!task.runId) continue;
        await this.ledger.settle(
          { profileId: task.profileId, runId: task.runId, runBudgetUnits: 0, sourceHash: task.sourceHash ?? undefined, taskId: task.id },
          task.units,
        );
        this.log.warn(`Settled ${task.state} ${task.tool} task ${task.id} at ${task.units} units after 24 hours`);
        closedInBatch++;
      }
      closed += closedInBatch;
      // Stop on a batch that closed nothing, or the same rows would come back for ever.
      if (closedInBatch === 0) return closed;
    }
  }
}

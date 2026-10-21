import { type Db, traceEntry } from '@interim/db';
import { type AgentStep, type TraceLine, type TraceReason, traceReasonSchema } from '@interim/types';
import { eq } from 'drizzle-orm';

/** A hard limit on steps in one run, so a loop that does not end cannot spend without bound (spec section 8). */
export const MAX_TRACE_STEPS = 60;

/** Writes a run's trace: one coded line per step, shown in short form on the card and in the progress screen. */
export class TraceWriter {
  private seq = 0;

  constructor(
    private readonly db: Db,
    private readonly runId: string,
  ) {}

  /** Starts the trace again, so a run that is delivered a second time does not repeat its lines. */
  async reset(): Promise<void> {
    await this.db.delete(traceEntry).where(eq(traceEntry.runId, this.runId));
    this.seq = 0;
  }

  /**
   * Adds a line. `costUnits` is what this step spent, for the unit ledger view. `inputs` keeps what
   * the step was decided from, such as the fact a strategy cites, and holds no personal data.
   */
  async add(
    step: AgentStep,
    reason: TraceReason,
    extra: { tool?: string; costUnits?: number; inputs?: Record<string, string> } = {},
  ): Promise<void> {
    if (this.seq >= MAX_TRACE_STEPS) throw new Error(`Run ${this.runId} passed ${MAX_TRACE_STEPS} steps`);
    await this.db.insert(traceEntry).values({
      runId: this.runId,
      seq: this.seq++,
      step,
      tool: extra.tool ?? null,
      inputs: extra.inputs ?? {},
      costUnits: extra.costUnits ?? 0,
      reason,
    });
  }

  /** The lines written so far, in order. */
  async lines(): Promise<TraceLine[]> {
    const rows = await this.db.select().from(traceEntry).where(eq(traceEntry.runId, this.runId)).orderBy(traceEntry.seq);
    return rows.map((r) => ({
      seq: r.seq,
      step: r.step,
      reason: traceReasonSchema.parse(r.reason),
      tool: r.tool,
      costUnits: r.costUnits,
    }));
  }
}

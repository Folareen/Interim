/** Who a call is for. Each field adds a cap that the call must fit under. */
export interface BudgetContext {
  profileId: string;
  runId: string;
  /** This run's own cap, from the template and config. */
  runBudgetUnits: number;
  /** Hash of the caller's address, never the address itself. */
  sourceHash?: string;
}

/** The fixed caps from config. */
export interface BudgetCaps {
  perProfile: number;
  perDay: number;
  perSourcePerDay: number;
}

/** One counter a call must fit under, with its cap. */
export interface BudgetScope {
  /** Key of the `budget_counter` row: `run:<id>`, `profile:<id>`, `day:<date>`, `source:<hash>:<date>`. */
  key: string;
  cap: number;
}

/**
 * Every cap a call must fit under, sorted by key. Callers lock the counter rows in this order, so
 * two calls with overlapping scopes cannot deadlock.
 * @param day UTC date (YYYY-MM-DD) the units were reserved on; settling later still uses it.
 */
export function budgetScopes(context: BudgetContext, caps: BudgetCaps, day: string): BudgetScope[] {
  const scopes: BudgetScope[] = [
    { key: `run:${context.runId}`, cap: context.runBudgetUnits },
    { key: `profile:${context.profileId}`, cap: caps.perProfile },
    { key: `day:${day}`, cap: caps.perDay },
  ];
  if (context.sourceHash) scopes.push({ key: `source:${context.sourceHash}:${day}`, cap: caps.perSourcePerDay });
  return scopes.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Whether reserving `units` more keeps a counter within its cap. Held and spent units both count. */
export function fitsCap(counter: { reservedUnits: number; settledUnits: number }, units: number, cap: number): boolean {
  return counter.reservedUnits + counter.settledUnits + units <= cap;
}

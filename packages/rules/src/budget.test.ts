import { describe, expect, it } from 'vitest';
import { budgetScopes, fitsCap } from './budget';

const caps = { perProfile: 500, perDay: 2000, perSourcePerDay: 100, perPartner: 1000 };
const context = { profileId: 'p1', runId: 'r1', runBudgetUnits: 50 };

describe('budgetScopes', () => {
  it('always applies run, profile and day caps', () => {
    expect(budgetScopes(context, caps, '2026-10-20')).toEqual([
      { key: 'day:2026-10-20', cap: 2000 },
      { key: 'profile:p1', cap: 500 },
      { key: 'run:r1', cap: 50 },
    ]);
  });

  it('adds source and partner caps only when the call has them', () => {
    const keys = budgetScopes({ ...context, sourceHash: 'abc', partnerId: 'acme' }, caps, '2026-10-20');
    expect(keys.map((s) => s.key)).toEqual([
      'day:2026-10-20',
      'partner:acme',
      'profile:p1',
      'run:r1',
      'source:abc:2026-10-20',
    ]);
    expect(keys.find((s) => s.key === 'partner:acme')?.cap).toBe(1000);
  });

  it('returns keys in a fixed order whatever the input', () => {
    const a = budgetScopes({ ...context, partnerId: 'x' }, caps, 'd').map((s) => s.key);
    expect(a).toEqual([...a].sort());
  });
});

describe('fitsCap', () => {
  it('counts held and spent units together', () => {
    expect(fitsCap({ reservedUnits: 20, settledUnits: 20 }, 10, 50)).toBe(true);
    expect(fitsCap({ reservedUnits: 20, settledUnits: 20 }, 11, 50)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { stylePreviewPlan } from './style';

const base = { hasCurrentConsent: true, referenceCount: 2, remainingUnits: 50 };

describe('stylePreviewPlan', () => {
  it('prices each reference at two units', () => {
    expect(stylePreviewPlan(base)).toEqual({ ok: true, units: 4 });
  });

  it('needs current consent', () => {
    expect(stylePreviewPlan({ ...base, hasCurrentConsent: false })).toEqual({ ok: false, problem: 'no_consent' });
  });

  it('needs one to three references', () => {
    expect(stylePreviewPlan({ ...base, referenceCount: 0 })).toEqual({ ok: false, problem: 'no_references' });
    expect(stylePreviewPlan({ ...base, referenceCount: 4 })).toEqual({ ok: false, problem: 'too_many_references' });
  });

  it('refuses a request the remaining budget cannot cover', () => {
    expect(stylePreviewPlan({ ...base, remainingUnits: 3 })).toEqual({ ok: false, problem: 'over_budget' });
  });
});

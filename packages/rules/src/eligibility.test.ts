import { describe, expect, it } from 'vitest';
import { type EligibilityContext, strategyTools, toolEligibility } from './eligibility';

const open: EligibilityContext = {
  templateKey: 'hair_loss_ahead',
  headCovering: false,
  hasDensity: true,
  blockedTools: new Set(),
  remainingUnits: 50,
};

describe('toolEligibility', () => {
  it('allows hair transfer on any head, bald included (rule 4)', () => {
    expect(toolEligibility('hairstyle', 2, open)).toEqual({ allowed: true });
  });

  it('never offers hair try on to a profile with head covering on (acceptance 10d)', () => {
    const covered = { ...open, headCovering: true };
    for (const tool of ['hairstyle', 'hair_volume', 'hair_color'] as const) {
      expect(toolEligibility(tool, 2, covered)).toEqual({ allowed: false, reason: 'blocked_head_covering' });
    }
  });

  it('skips hair measures on a covered head, but still allows face tools and brows', () => {
    const covered = { ...open, headCovering: true };
    expect(toolEligibility('hair_density', 1, covered)).toEqual({ allowed: false, reason: 'blocked_head_covering' });
    expect(toolEligibility('face_shape', 10, covered)).toEqual({ allowed: true });
    expect(toolEligibility('makeup_brows', 1, covered)).toEqual({ allowed: true });
  });

  it('blocks a tool the capture check or YouCam marked blocked (rules 2 and 5)', () => {
    expect(toolEligibility('hairstyle', 2, { ...open, blockedTools: new Set(['hairstyle']) })).toEqual({
      allowed: false,
      reason: 'blocked_tool',
    });
  });

  it('allows beard style only in the beard template (rule 7)', () => {
    expect(toolEligibility('beard_style', 2, open)).toEqual({ allowed: false, reason: 'blocked_not_allowed' });
    expect(toolEligibility('beard_style', 2, { ...open, templateKey: 'beard_growth' })).toEqual({ allowed: true });
  });

  it('allows hair volume only when density is present (rule 8)', () => {
    expect(toolEligibility('hair_volume', 2, { ...open, hasDensity: false })).toEqual({
      allowed: false,
      reason: 'blocked_not_allowed',
    });
  });

  it('blocks a call that would pass the remaining cap (rule 10)', () => {
    expect(toolEligibility('hairstyle', 2, { ...open, remainingUnits: 1 })).toEqual({ allowed: false, reason: 'blocked_budget' });
    expect(toolEligibility('hairstyle', 2, { ...open, remainingUnits: 2 })).toEqual({ allowed: true });
  });
});

describe('strategyTools', () => {
  it('maps each strategy to the tools that render it', () => {
    expect(strategyTools('cut', 'hair_loss_ahead')).toEqual(['hairstyle']);
    expect(strategyTools('cut', 'beard_growth')).toEqual(['beard_style']);
    expect(strategyTools('volume', 'hair_patches')).toEqual(['hair_volume']);
    expect(strategyTools('hold', 'hair_patches')).toEqual([]);
  });
});

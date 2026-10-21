import { templateKeys } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { situationGroups } from './situations';

describe('situation groups', () => {
  it('shows every situation exactly once, so none is lost from the picker', () => {
    const shown = [...situationGroups.illness, ...situationGroups.other];
    expect([...shown].sort()).toEqual([...templateKeys].sort());
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('keeps the illness first situations first, in the order the overview lists them', () => {
    expect(templateKeys.slice(0, 5)).toEqual([...situationGroups.illness]);
  });
});

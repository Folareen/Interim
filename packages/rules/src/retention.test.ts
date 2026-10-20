import { describe, expect, it } from 'vitest';
import { expiresAt } from './retention';

const from = new Date('2026-01-31T10:00:00Z');

describe('expiresAt', () => {
  it('keeps standard photos for 30 days', () => {
    expect(expiresAt('standard', from).toISOString()).toBe('2026-03-02T10:00:00.000Z');
  });

  it('keeps history photos for 24 months', () => {
    expect(expiresAt('extended', new Date('2026-01-15T10:00:00Z')).toISOString()).toBe('2028-01-15T10:00:00.000Z');
  });

  it('does not change the input date', () => {
    expiresAt('standard', from);
    expect(from.toISOString()).toBe('2026-01-31T10:00:00.000Z');
  });
});

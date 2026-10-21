import { describe, expect, it } from 'vitest';
import { negotiateLocale, safeNext } from './locale';

describe('negotiateLocale', () => {
  it('opens in the first offered language, by preference', () => {
    expect(negotiateLocale('de;q=0.9, fr-CA;q=0.8, en;q=0.5')).toBe('fr');
    expect(negotiateLocale('en;q=0.4, yo;q=0.9')).toBe('yo');
  });

  it('treats a regional tag as its base language', () => {
    expect(negotiateLocale('pt-BR')).toBe('pt');
    expect(negotiateLocale('sw-KE,en')).toBe('sw');
  });

  it('finds Nigerian Pidgin', () => {
    expect(negotiateLocale('pcm-NG')).toBe('pcm');
  });

  it('ignores languages that are not offered, a zero weight and a missing header', () => {
    expect(negotiateLocale('de, ja')).toBeUndefined();
    expect(negotiateLocale('fr;q=0, de')).toBeUndefined();
    expect(negotiateLocale(null)).toBeUndefined();
    expect(negotiateLocale('')).toBeUndefined();
  });
});

describe('safeNext', () => {
  it('keeps addresses on this site', () => {
    expect(safeNext('/consent/abc', '/situation')).toBe('/consent/abc');
    expect(safeNext('/setup?situation=going_grey', '/situation')).toBe('/setup?situation=going_grey');
  });

  it('falls back for anything that could leave the site', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', undefined, 42]) {
      expect(safeNext(bad, '/situation')).toBe('/situation');
    }
  });
});

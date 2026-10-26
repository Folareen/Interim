import { describe, expect, it } from 'vitest';
import { checkInDue, localClock, wordsDue } from './notifications';

const at = (iso: string) => new Date(iso);

describe('localClock', () => {
  it('reads the same instant differently in two zones', () => {
    const now = at('2026-10-26T07:05:00Z');
    expect(localClock(now, 'Africa/Lagos')).toEqual({ date: '2026-10-26', minutes: 8 * 60 + 5 });
    expect(localClock(now, 'America/New_York')).toEqual({ date: '2026-10-26', minutes: 3 * 60 + 5 });
  });

  it('crosses the date line and follows half hour zones', () => {
    expect(localClock(at('2026-10-26T20:30:00Z'), 'Pacific/Auckland')).toEqual({ date: '2026-10-27', minutes: 9 * 60 + 30 });
    expect(localClock(at('2026-10-26T02:30:00Z'), 'Asia/Kolkata')).toEqual({ date: '2026-10-26', minutes: 8 * 60 });
  });

  it('reads midnight as 00:00, not 24:00', () => {
    expect(localClock(at('2026-10-26T23:00:00Z'), 'Africa/Lagos')).toEqual({ date: '2026-10-27', minutes: 0 });
  });
});

describe('wordsDue', () => {
  const now = at('2026-10-26T07:05:00Z');
  const lagos = localClock(now, 'Africa/Lagos');

  it('is due in the hour that starts at the chosen time', () => {
    expect(wordsDue({ wordsAt: '08:00', lastSentAt: null }, lagos, now)).toBe(true);
    expect(wordsDue({ wordsAt: '07:30', lastSentAt: null }, lagos, now)).toBe(true);
  });

  it('is not due before or after that hour, or when off', () => {
    expect(wordsDue({ wordsAt: '08:30', lastSentAt: null }, lagos, now)).toBe(false);
    expect(wordsDue({ wordsAt: '07:00', lastSentAt: null }, lagos, now)).toBe(false);
    expect(wordsDue({ wordsAt: null, lastSentAt: null }, lagos, now)).toBe(false);
  });

  it('catches a half hour time on the hourly run, including past midnight', () => {
    const india = at('2026-10-26T02:35:00Z');
    expect(wordsDue({ wordsAt: '08:00', lastSentAt: null }, localClock(india, 'Asia/Kolkata'), india)).toBe(true);
    const late = at('2026-10-26T23:10:00Z');
    expect(wordsDue({ wordsAt: '23:30', lastSentAt: null }, localClock(late, 'UTC'), late)).toBe(false);
    const wrap = at('2026-10-27T00:10:00Z');
    expect(wordsDue({ wordsAt: '23:30', lastSentAt: null }, localClock(wrap, 'UTC'), wrap)).toBe(true);
  });

  it('is sent once a day', () => {
    expect(wordsDue({ wordsAt: '08:00', lastSentAt: at('2026-10-26T07:00:30Z') }, lagos, now)).toBe(false);
    expect(wordsDue({ wordsAt: '08:00', lastSentAt: at('2026-10-25T07:00:30Z') }, lagos, now)).toBe(true);
  });
});

describe('checkInDue', () => {
  const now = at('2026-10-26T09:10:00Z'); // 10:10 in Lagos
  const lagos = localClock(now, 'Africa/Lagos');
  const base = { everyDays: 14, lastSentAt: null };

  it('is due once the cadence has passed, in the reminder hour', () => {
    expect(checkInDue({ ...base, lastCheckInAt: at('2026-10-10T12:00:00Z') }, lagos, now)).toBe(true);
  });

  it('is not due before the cadence, with no check in yet, or outside the reminder hour', () => {
    expect(checkInDue({ ...base, lastCheckInAt: at('2026-10-20T12:00:00Z') }, lagos, now)).toBe(false);
    expect(checkInDue({ ...base, lastCheckInAt: null }, lagos, now)).toBe(false);
    const early = at('2026-10-26T06:10:00Z');
    expect(checkInDue({ ...base, lastCheckInAt: at('2026-10-10T12:00:00Z') }, localClock(early, 'Africa/Lagos'), early)).toBe(false);
  });

  it('reminds once for each time the cadence comes due', () => {
    const lastCheckInAt = at('2026-10-10T12:00:00Z');
    expect(checkInDue({ ...base, lastCheckInAt, lastSentAt: at('2026-10-25T09:00:00Z') }, lagos, now)).toBe(false);
    // A new check in restarts the cadence, so an old reminder no longer counts.
    expect(checkInDue({ ...base, lastCheckInAt: at('2026-10-11T08:00:00Z'), lastSentAt: at('2026-10-10T09:00:00Z') }, lagos, now)).toBe(true);
  });
});

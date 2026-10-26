const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const HOUR = 60;

/** Local time for the check in reminder, since the person picks a time for words for today only. */
export const CHECK_IN_REMINDER_AT = '10:00';

/** A moment as the wall clock reads in one time zone. */
export interface LocalClock {
  /** YYYY-MM-DD. */
  date: string;
  /** Minutes since local midnight. */
  minutes: number;
}

/** Reads `now` on the wall clock of an IANA time zone. */
export function localClock(now: Date, timeZone: string): LocalClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * HOUR + Number(parts.minute) };
}

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * HOUR + minutes;
}

/**
 * Whether the local clock is in the hour that starts at `time`. The job runs hourly at an unknown
 * minute, so an hour wide window catches each time exactly once, including half hour zones.
 */
function inHourFrom(clock: LocalClock, time: string): boolean {
  return (clock.minutes - minutesOf(time) + 24 * HOUR) % (24 * HOUR) < HOUR;
}

/**
 * Whether words for today is due. Sent at most once a day: the hour wide window is far shorter
 * than the half day guard, so a retry inside the same window cannot send twice.
 */
export function wordsDue(input: { wordsAt: string | null; lastSentAt: Date | null }, clock: LocalClock, now: Date): boolean {
  if (!input.wordsAt || !inHourFrom(clock, input.wordsAt)) return false;
  return !input.lastSentAt || now.getTime() - input.lastSentAt.getTime() > DAY_MS / 2;
}

/**
 * Whether a check in reminder is due: the template's cadence has passed since the last check in, it
 * is the reminder hour, and none was sent since the cadence came due. With no check in yet there
 * is no cadence to be due.
 */
export function checkInDue(
  input: { lastCheckInAt: Date | null; everyDays: number; lastSentAt: Date | null },
  clock: LocalClock,
  now: Date,
): boolean {
  if (!input.lastCheckInAt || !inHourFrom(clock, CHECK_IN_REMINDER_AT)) return false;
  const dueAt = input.lastCheckInAt.getTime() + input.everyDays * DAY_MS;
  if (now.getTime() < dueAt) return false;
  return !input.lastSentAt || input.lastSentAt.getTime() < dueAt;
}

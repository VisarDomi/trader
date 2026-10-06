/**
 * Market clock helpers.
 *
 * Capital.com's daily session break and overnight-funding charge both happen
 * at 17:00 New York time (21:00 UTC in summer, 22:00 UTC in winter).
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const NEW_YORK = 'America/New_York';
const ROLLOVER_MINUTE_NY = 17 * 60;
/** intradayOnly agents are flattened this many minutes before the break. */
const SESSION_END_LEAD_MINUTES = 5;
/** ...and may not open again until this many minutes after the break started. */
const SESSION_REOPEN_AFTER_MINUTES = 65;

const nyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const offsetByHour = new Map<number, number>();

/** UTC offset of New York at time t, in ms (e.g. -4h in summer). Cached per UTC hour. */
export function newYorkOffsetMs(t: number): number {
  const hour = Math.floor(t / HOUR_MS);
  let offset = offsetByHour.get(hour);
  if (offset === undefined) {
    const at = hour * HOUR_MS;
    const parts = Object.fromEntries(nyFormatter.formatToParts(new Date(at)).map(p => [p.type, p.value]));
    const localAsUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
    offset = localAsUtc - at;
    offsetByHour.set(hour, offset);
  }
  return offset;
}

/** Minutes since local midnight in New York. */
export function newYorkMinuteOfDay(t: number): number {
  const local = t + newYorkOffsetMs(t);
  return Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS);
}

/** Index of the funding day containing t; it increments at every 17:00 New York rollover. */
export function fundingDay(t: number): number {
  const local = t + newYorkOffsetMs(t);
  return Math.floor((local - ROLLOVER_MINUTE_NY * MINUTE_MS) / DAY_MS);
}

/** True in the last minutes before the daily break: intradayOnly positions must be closed. */
export function isSessionEnd(t: number): boolean {
  const m = newYorkMinuteOfDay(t);
  return m >= ROLLOVER_MINUTE_NY - SESSION_END_LEAD_MINUTES && m < ROLLOVER_MINUTE_NY;
}

/** True from shortly before the daily break until after it: intradayOnly agents may not open. */
export function isSessionBlackout(t: number): boolean {
  const m = newYorkMinuteOfDay(t);
  return m >= ROLLOVER_MINUTE_NY - SESSION_END_LEAD_MINUTES && m < ROLLOVER_MINUTE_NY + SESSION_REOPEN_AFTER_MINUTES;
}

export function utcDay(t: number): number {
  return Math.floor(t / DAY_MS);
}

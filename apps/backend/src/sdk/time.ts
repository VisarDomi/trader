/**
 * Wall-clock helpers for session-based agents.
 *
 *   const ny = localTime(ctx.time, 'America/New_York');
 *   if (ny.hour === 9 && ny.minute === 30) ...
 *
 * Deterministic (no Date.now()), DST-aware, cached per UTC hour.
 */

export const TZ = {
  NEW_YORK: 'America/New_York',
  LONDON: 'Europe/London',
  TOKYO: 'Asia/Tokyo',
  UTC: 'UTC',
} as const;

export interface LocalTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** Minutes since local midnight. */
  minuteOfDay: number;
  /** "YYYY-MM-DD" in that time zone — handy as a "new day" key in ctx.state. */
  date: string;
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatters = new Map<string, Intl.DateTimeFormat>();
const hourCache = new Map<string, Omit<LocalTime, 'minute' | 'minuteOfDay'> & { minuteAtHour: number }>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Local calendar time of `time` (ms UTC) in an IANA time zone. */
export function localTime(time: number, timeZone: string = TZ.NEW_YORK): LocalTime {
  const hourStart = Math.floor(time / HOUR_MS) * HOUR_MS;
  const key = `${timeZone}:${hourStart}`;
  let h = hourCache.get(key);
  if (!h) {
    const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(hourStart)).map(p => [p.type, p.value]));
    h = {
      year: +parts.year!,
      month: +parts.month!,
      day: +parts.day!,
      hour: +parts.hour!,
      minuteAtHour: +parts.minute!,
      weekday: WEEKDAYS[parts.weekday!]!,
      date: `${parts.year}-${parts.month}-${parts.day}`,
    };
    if (hourCache.size > 50_000) hourCache.clear();
    hourCache.set(key, h);
  }
  // Every IANA zone in use has whole-hour or half-hour offsets; minutes past the UTC hour carry over.
  const extra = Math.floor((time - hourStart) / MINUTE_MS);
  const total = h.hour * 60 + h.minuteAtHour + extra;
  if (total >= 24 * 60) {
    // Crossed local midnight inside this UTC hour (half-hour zones only): recompute exactly.
    hourCache.delete(key);
    return exact(time, timeZone);
  }
  return {
    year: h.year,
    month: h.month,
    day: h.day,
    hour: Math.floor(total / 60),
    minute: total % 60,
    weekday: h.weekday,
    minuteOfDay: total,
    date: h.date,
  };
}

function exact(time: number, timeZone: string): LocalTime {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(time)).map(p => [p.type, p.value]));
  const hour = +parts.hour!;
  const minute = +parts.minute!;
  return {
    year: +parts.year!,
    month: +parts.month!,
    day: +parts.day!,
    hour,
    minute,
    weekday: WEEKDAYS[parts.weekday!]!,
    minuteOfDay: hour * 60 + minute,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

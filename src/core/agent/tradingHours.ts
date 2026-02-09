import type { TradingHours } from './types.ts';

interface LocalTime {
  hour: number;
  minute: number;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
    });
    formatters.set(timezone, fmt);
  }
  return fmt;
}

const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function getLocalTime(timestamp: number, timezone: string): LocalTime {
  const parts = getFormatter(timezone).formatToParts(new Date(timestamp));
  const hour = parseInt(parts.find(p => p.type === 'hour')!.value);
  const minute = parseInt(parts.find(p => p.type === 'minute')!.value);
  const weekday = parts.find(p => p.type === 'weekday')!.value;
  return { hour, minute, dayOfWeek: DAY_MAP[weekday]! };
}

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h! * 60 + m!;
}

export function isWithinTradingHours(timestamp: number, hours: TradingHours): boolean {
  const { hour, minute, dayOfWeek } = getLocalTime(timestamp, hours.timezone);

  // Skip weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const timeMinutes = hour * 60 + minute;
  const openMinutes = parseTime(hours.open);
  const closeMinutes = parseTime(hours.close);

  return timeMinutes >= openMinutes && timeMinutes < closeMinutes;
}

export function isMarketCloseCandle(
  timestamp: number,
  hours: TradingHours,
): boolean {
  const { hour, minute, dayOfWeek } = getLocalTime(timestamp, hours.timezone);

  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const timeMinutes = hour * 60 + minute;
  const closeMinutes = parseTime(hours.close);

  // The last minute candle before close (e.g., 15:59 for 16:00 close)
  return timeMinutes === closeMinutes - 1;
}

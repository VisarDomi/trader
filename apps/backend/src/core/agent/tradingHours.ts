import type { TradingGap, TradingHours } from './types.ts';

interface LocalTime {
  hour: number;
  minute: number;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
}

// ============================================
// Intl formatters (reused, never re-created)
// ============================================

const formatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

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

function getDateFormatter(timezone: string): Intl.DateTimeFormat {
  let fmt = dateFormatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatters.set(timezone, fmt);
  }
  return fmt;
}

const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// ============================================
// Hour-level cache (Intl called once per UTC hour)
// ============================================

interface HourInfo {
  localHour: number;
  localMinute: number;
  dayOfWeek: number;
  localDate: string;
}

const hourCache = new Map<number, HourInfo>();

function getHourInfo(timestamp: number, timezone: string): HourInfo {
  const hourBucket = Math.floor(timestamp / 3600000);
  let info = hourCache.get(hourBucket);
  if (info) return info;

  const dt = new Date(hourBucket * 3600000);
  const parts = getFormatter(timezone).formatToParts(dt);
  const h = parseInt(parts.find(p => p.type === 'hour')!.value);
  const m = parseInt(parts.find(p => p.type === 'minute')!.value);
  const wd = parts.find(p => p.type === 'weekday')!.value;
  const localDate = getDateFormatter(timezone).format(dt);

  info = { localHour: h, localMinute: m, dayOfWeek: DAY_MAP[wd]!, localDate };
  hourCache.set(hourBucket, info);
  return info;
}

// ============================================
// Fast local time (arithmetic from cached hour)
// ============================================

export function getLocalTime(timestamp: number, timezone: string): LocalTime {
  const hourBucket = Math.floor(timestamp / 3600000);
  const info = getHourInfo(timestamp, timezone);

  const minuteOffset = Math.floor((timestamp - hourBucket * 3600000) / 60000);
  const totalMinutes = info.localHour * 60 + info.localMinute + minuteOffset;
  const localMinOfDay = ((totalMinutes % 1440) + 1440) % 1440;

  return {
    hour: Math.floor(localMinOfDay / 60),
    minute: localMinOfDay % 60,
    dayOfWeek: info.dayOfWeek,
  };
}

// ============================================
// Pre-parsed gap times (parsed once, not per call)
// ============================================

interface ParsedGap {
  from: string;
  gapStartMin: number;
  gapEndMin: number;
}

const parsedGapsCache = new WeakMap<TradingHours, ParsedGap[]>();

function getParsedGaps(hours: TradingHours): ParsedGap[] {
  let parsed = parsedGapsCache.get(hours);
  if (parsed) return parsed;

  parsed = hours.gaps.map(g => {
    const [sh, sm] = g.gapStart.split(':').map(Number);
    const [eh, em] = g.gapEnd.split(':').map(Number);
    return { from: g.from, gapStartMin: sh! * 60 + sm!, gapEndMin: eh! * 60 + em! };
  });
  parsedGapsCache.set(hours, parsed);
  return parsed;
}

// ============================================
// Combined trading status (single cache lookup)
// ============================================

export interface TradingStatus {
  isWithinHours: boolean;
  isMarketClose: boolean;
}

export function getTradingStatus(timestamp: number, hours: TradingHours): TradingStatus {
  const hourBucket = Math.floor(timestamp / 3600000);
  const info = getHourInfo(timestamp, hours.timezone);

  if (info.dayOfWeek === 0 || info.dayOfWeek === 6) {
    return { isWithinHours: false, isMarketClose: false };
  }

  const minuteOffset = Math.floor((timestamp - hourBucket * 3600000) / 60000);
  const totalMinutes = info.localHour * 60 + info.localMinute + minuteOffset;
  const localMinOfDay = ((totalMinutes % 1440) + 1440) % 1440;

  // Find active gap
  const parsedGaps = getParsedGaps(hours);
  let gap: ParsedGap | null = null;
  for (const g of parsedGaps) {
    if (g.from <= info.localDate) gap = g;
    else break;
  }

  if (!gap) return { isWithinHours: true, isMarketClose: false };

  let isWithinHours: boolean;
  if (gap.gapEndMin > gap.gapStartMin) {
    isWithinHours = !(localMinOfDay >= gap.gapStartMin && localMinOfDay < gap.gapEndMin);
  } else {
    isWithinHours = !(localMinOfDay >= gap.gapStartMin || localMinOfDay < gap.gapEndMin);
  }

  const isMarketClose = localMinOfDay === gap.gapStartMin - 1;

  return { isWithinHours, isMarketClose };
}

// ============================================
// Legacy API (kept for backward compatibility)
// ============================================

export function isWithinTradingHours(timestamp: number, hours: TradingHours): boolean {
  return getTradingStatus(timestamp, hours).isWithinHours;
}

export function isMarketCloseCandle(timestamp: number, hours: TradingHours): boolean {
  return getTradingStatus(timestamp, hours).isMarketClose;
}

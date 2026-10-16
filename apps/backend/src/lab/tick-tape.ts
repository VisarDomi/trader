/** Merge archived quotes with lazy synthetic minutes; never add fictional prices inside a recorded minute. */
import { sql } from '../data/db.ts';
import { ensureTickSchema } from './tick-store.ts';
import { unpackTicks } from '../data/tick-codec.ts';
import { TICK_SOURCE, type Tick } from '../engine/ticks.ts';
import { syntheticTicks, DEFAULT_TICKS_PER_MINUTE, DEFAULT_TICK_SEED, SYNTHETIC_TICK_VERSION } from '../engine/synthetic-ticks.ts';
import { candleAt, candleCount, loadCandleArray } from './candles.ts';
import { HOUR_MS, MINUTE_MS } from '../engine/clock.ts';
import type { Candle } from '../engine/series.ts';
import { getInstrument } from '../engine/instruments.ts';
export const TICK_MODE = { AUTO: 'auto', RECORDED: 'recorded', SYNTHETIC: 'synthetic' } as const;
export type TickMode = (typeof TICK_MODE)[keyof typeof TICK_MODE];
export interface RecordingWatermark {
  journalId: string;
  through: number;
}
export interface ReplayOptions {
  mode?: TickMode;
  seed?: number;
  ticksPerMinute?: number;
  recordings?: RecordingWatermark[];
}
export interface ReplayData {
  mode: TickMode;
  seed: number;
  ticksPerMinute: number;
  generator: string;
  recordings: RecordingWatermark[];
  recordedTicks: number;
  syntheticTicks: number;
  recordedMinutes: number;
  syntheticMinutes: number;
  uncoveredMinutes: number;
  firstTickAt: number | null;
  lastTickAt: number | null;
  rejectedTicks: number;
  partialRecordedMinutes: number;
  execution: string;
}
export async function recordingSnapshot(start: number, end: number): Promise<RecordingWatermark[]> {
  await ensureTickSchema();
  const rows =
    await sql`SELECT journal_id,MAX(through_id) n FROM tick_chunks WHERE end_at>=${start} AND start_at<${end} GROUP BY journal_id ORDER BY journal_id`;
  return rows.map((r: { journal_id: string; n: string | number }) => ({ journalId: r.journal_id, through: Number(r.n) }));
}
export function replayData(options: ReplayOptions = {}): ReplayData {
  return {
    mode: options.mode ?? TICK_MODE.AUTO,
    seed: options.seed ?? DEFAULT_TICK_SEED,
    ticksPerMinute: options.ticksPerMinute ?? DEFAULT_TICKS_PER_MINUTE,
    generator: SYNTHETIC_TICK_VERSION,
    recordings: options.recordings ?? [],
    recordedTicks: 0,
    syntheticTicks: 0,
    recordedMinutes: 0,
    syntheticMinutes: 0,
    uncoveredMinutes: 0,
    firstTickAt: null,
    lastTickAt: null,
    rejectedTicks: 0,
    partialRecordedMinutes: 0,
    execution:
      '500 ms command latency, per-run simulated API pacing; current Capital dealing-rule snapshot, historical market hours inferred from price availability',
  };
}
interface Minute {
  time: number;
  candle: Candle | null;
  ticks: Tick[];
  covered: boolean;
}
/** Decode only this instrument's blocks; memory is bounded by one compressed block. */
async function* recordedMinutes(epic: string, start: number, end: number, recordings: RecordingWatermark[]): AsyncGenerator<Minute> {
  if (!recordings.length) return;
  const blocks: { journal_id: string; first_id: number; first_at: number }[] = [];
  const sessions: { started_at: number | string; until: number | string }[] = [];
  for (const recording of recordings) {
    const part =
      await sql`SELECT t.journal_id,t.first_id,s.first_at FROM tick_chunks t JOIN tick_recording_stats s ON s.journal_id=t.journal_id WHERE t.journal_id=${recording.journalId} AND t.first_id<=${recording.through} AND t.instrument=${epic} AND t.end_at>=${start} AND t.start_at<${end} ORDER BY t.first_id`;
    blocks.push(...part);
    const intervals =
      await sql`SELECT started_at,COALESCE(ended_at,last_received_at) until,epics FROM tick_capture_sessions WHERE journal_id=${recording.journalId} AND started_at<${end} AND COALESCE(ended_at,last_received_at)>=${start}`;
    sessions.push(...intervals.filter((s: { epics: string }) => JSON.parse(s.epics).includes(epic)));
  }
  blocks.sort(
    (a, b) =>
      Number(a.first_at) - Number(b.first_at) || a.journal_id.localeCompare(b.journal_id) || Number(a.first_id) - Number(b.first_id),
  );
  const limits = new Map(recordings.map((r) => [r.journalId, r.through]));
  let minute: Minute | null = null;
  for (const block of blocks) {
    const [row] = await sql`SELECT payload,sha256 FROM tick_chunks WHERE journal_id=${block.journal_id} AND first_id=${block.first_id}`;
    for (const r of unpackTicks(row.payload, row.sha256)) {
      if (r.id > limits.get(block.journal_id)! || r.receivedAt < start || r.receivedAt >= end) continue;
      const time = Math.floor(r.receivedAt / MINUTE_MS) * MINUTE_MS;
      if (minute && minute.time !== time) {
        yield minute;
        minute = null;
      }
      minute ??= {
        time,
        candle: null,
        ticks: [],
        covered: sessions.some(
          (s: { started_at: number | string; until: number | string }) =>
            Number(s.started_at) <= time && Number(s.until) >= time + MINUTE_MS,
        ),
      };
      minute.ticks.push({
        time: r.time,
        receivedAt: r.receivedAt,
        bid: r.bid,
        ask: r.ask,
        source: TICK_SOURCE.RECORDED,
        sequence: r.id,
        journalId: block.journal_id,
      });
    }
  }
  if (minute) yield minute;
}
export async function* tickMinutes(
  epic: string,
  start: number,
  end: number,
  options: ReplayOptions,
  stats: ReplayData,
): AsyncGenerator<Minute> {
  const instrument = getInstrument(epic);
  const mode = options.mode ?? TICK_MODE.AUTO;
  const data = mode === TICK_MODE.RECORDED ? new Float64Array() : await loadCandleArray(epic, start, end, end > Date.now());
  const real = recordedMinutes(epic, start, end, mode === TICK_MODE.SYNTHETIC ? [] : stats.recordings)[Symbol.asyncIterator]();
  let next = await real.next(),
    i = 0;
  while (i < candleCount(data) || !next.done) {
    const candle = i < candleCount(data) ? candleAt(data, i) : null;
    const time = Math.min(candle?.time ?? Infinity, next.done ? Infinity : next.value.time);
    const minute: Minute = { time, candle: candle?.time === time ? candle : null, ticks: [], covered: false };
    if (candle?.time === time) i++;
    if (!next.done && next.value.time === time) {
      minute.ticks = next.value.ticks;
      minute.covered = next.value.covered;
      next = await real.next();
    }
    if (minute.ticks.length) {
      stats.recordedMinutes++;
      stats.recordedTicks += minute.ticks.length;
      if (!minute.covered) stats.partialRecordedMinutes++;
    } else if (minute.candle && mode !== TICK_MODE.RECORDED) {
      // Only one minute is materialized, never a historical synthetic tick database.
      minute.ticks = [
        ...syntheticTicks(epic, minute.candle, {
          seed: stats.seed,
          ticksPerMinute: stats.ticksPerMinute,
          precision: instrument.pricePrecision,
          spread: instrument.typicalSpread,
        }),
      ];
      stats.syntheticMinutes++;
      stats.syntheticTicks += minute.ticks.length;
    } else {
      stats.uncoveredMinutes++;
      continue;
    }
    const first = minute.ticks[0]!.receivedAt,
      last = minute.ticks.at(-1)!.receivedAt;
    stats.firstTickAt = stats.firstTickAt === null ? first : Math.min(stats.firstTickAt, first);
    stats.lastTickAt = last;
    yield minute;
  }
}

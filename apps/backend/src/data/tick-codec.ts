/** Lossless, columnar delta encoding followed by gzip. One permanent compressed tick copy. */
import type { RecordedTick } from '../engine/ticks.ts';
export const TICK_CODEC_VERSION = 'tick-columns-v1';
const COLUMNS = 6;
const MAX_ROWS = 100_000;
interface PriceDictionary {
  epic: string;
  scale: number;
}
interface Header {
  version: typeof TICK_CODEC_VERSION;
  rows: number;
  epics: PriceDictionary[];
}
export interface PackedTicks {
  payload: Uint8Array;
  sha256: string;
  rows: number;
  bytes: number;
}
export const tickChecksum = (bytes: Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
export function packTicks(ticks: readonly RecordedTick[]): PackedTicks {
  if (!ticks.length || ticks.length > MAX_ROWS) throw new Error('tick block must contain 1..100000 quotes');
  const epics: PriceDictionary[] = [...new Set(ticks.map((q) => q.epic))].map((epic) => ({ epic, scale: 0 }));
  if (epics.length > 255) throw new Error('too many instruments in one tick block');
  const ids = new Map(epics.map((p, i) => [p.epic, i]));
  for (const p of epics) {
    const quotes = ticks.filter((q) => q.epic === p.epic);
    for (let scale = 1; scale <= 1e8; scale *= 10) {
      if (
        quotes.every((q) => [q.bid, q.ask].every((v) => Number.isSafeInteger(Math.round(v * scale)) && Math.round(v * scale) / scale === v))
      ) {
        p.scale = scale;
        break;
      }
    }
  }
  const header = new TextEncoder().encode(JSON.stringify({ version: TICK_CODEC_VERSION, rows: ticks.length, epics } satisfies Header));
  const offset = Math.ceil((4 + header.length) / 8) * 8;
  const raw = new Uint8Array(offset + ticks.length * (COLUMNS * 8 + 2)),
    view = new DataView(raw.buffer);
  view.setUint32(0, header.length, true);
  raw.set(header, 4);
  const lastSource = epics.map(() => 0),
    lastBid = epics.map(() => 0);
  let lastId = 0,
    lastSession = 0,
    lastReceive = 0;
  const n = ticks.length,
    epicOffset = offset + n * COLUMNS * 8;
  for (let i = 0; i < n; i++) {
    const q = ticks[i]!,
      e = ids.get(q.epic)!,
      scale = epics[e]!.scale;
    if (
      ![q.id, q.session, q.time, q.receivedAt].every(Number.isSafeInteger) ||
      !Number.isFinite(q.bid) ||
      !Number.isFinite(q.ask) ||
      q.bid <= 0 ||
      q.ask < q.bid
    )
      throw new Error('invalid raw tick');
    const bid = scale ? Math.round(q.bid * scale) : q.bid;
    const fields = [
      q.id - lastId,
      q.session - lastSession,
      q.time - lastSource[e]!,
      q.receivedAt - lastReceive,
      scale ? bid - lastBid[e]! : bid,
      scale ? Math.round(q.ask * scale) - bid : q.ask,
    ];
    for (let f = 0; f < COLUMNS; f++) view.setFloat64(offset + (f * n + i) * 8, fields[f]!, true);
    raw[epicOffset + i] = e;
    raw[epicOffset + n + i] = q.timestampFallback;
    lastId = q.id;
    lastSession = q.session;
    lastSource[e] = q.time;
    lastReceive = q.receivedAt;
    lastBid[e] = bid;
  }
  const payload = Bun.gzipSync(raw);
  return { payload, sha256: tickChecksum(payload), rows: n, bytes: payload.length };
}
export function unpackTicks(payload: Uint8Array, sha256?: string): RecordedTick[] {
  if (sha256 && tickChecksum(payload) !== sha256) throw new Error('tick block checksum failed');
  const raw = Bun.gunzipSync(new Uint8Array(payload)),
    view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw.length < 4) throw new Error('invalid tick block');
  const length = view.getUint32(0, true);
  if (length > 1_000_000 || length + 4 > raw.length) throw new Error('invalid tick block header');
  const h = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + length))) as Header;
  if (h.version !== TICK_CODEC_VERSION || !Number.isInteger(h.rows) || h.rows < 1 || h.rows > MAX_ROWS || h.epics.length > 255)
    throw new Error('unsupported tick block');
  const n = h.rows,
    offset = Math.ceil((4 + length) / 8) * 8,
    epicOffset = offset + n * COLUMNS * 8;
  if (raw.length !== offset + n * (COLUMNS * 8 + 2)) throw new Error('truncated tick block');
  const lastSource = h.epics.map(() => 0),
    lastBid = h.epics.map(() => 0),
    out: RecordedTick[] = [];
  let id = 0,
    session = 0,
    receive = 0;
  for (let i = 0; i < n; i++) {
    const e = raw[epicOffset + i]!,
      p = h.epics[e];
    if (!p) throw new Error('invalid tick instrument index');
    const value = (f: number) => view.getFloat64(offset + (f * n + i) * 8, true);
    id += value(0);
    session += value(1);
    lastSource[e]! += value(2);
    receive += value(3);
    const bid = p.scale ? lastBid[e]! + value(4) : value(4);
    lastBid[e] = bid;
    out.push({
      id,
      session,
      epic: p.epic,
      time: lastSource[e]!,
      receivedAt: receive,
      bid: p.scale ? bid / p.scale : bid,
      ask: p.scale ? (bid + value(5)) / p.scale : value(5),
      timestampFallback: raw[epicOffset + n + i]!,
    });
  }
  return out;
}

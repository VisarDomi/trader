/**
 * Native app wire format (v2): the server builds each screen the iPhone app shows, ready to draw.
 * The app stores the document as it came (one SQLite row per screen) and revalidates it with its ETag;
 * it no longer downloads raw arena records and reshapes them on the phone.
 *
 * Chart series travel as packed little-endian arrays in base64: times as Float64 (epoch ms), values as
 * Float32. A series without times is evenly spaced over the graph's from → through (the trade mini charts).
 * Empty fields are omitted; the app's decoder supplies the defaults.
 */
export type Tone = -1 | 0 | 1;
export interface Stat { label: string; value: string; tone?: Tone }
export interface RouteRef { screen: string; id?: string; stage?: string; version?: string; title?: string; scenario?: string }
export interface Series { name: string; t?: string; v: string }
export interface Marker { t: number; value: number | null; label: string; detail?: string; tone?: Tone }
export interface Guide { label: string; value: number; tone?: Tone }
export interface Bar { name: string; value: number; total?: boolean }
export interface Graph {
	kind?: 'line' | 'price' | 'bars' | 'waterfall' | 'meter' | 'spark';
	unit?: string; precision?: number; height?: number; from?: number; through?: number;
	series?: Series[]; markers?: Marker[]; guides?: Guide[]; bars?: Bar[];
	candles?: { t: string; o: string; h: string; l: string; c: string };
	gaps?: { from: number; through: number }[];
	meter?: { value: number; limit: number; above: boolean; price?: boolean };
}
export interface Row {
	id: string; title: string; subtitle?: string; body?: string; badge?: string; badgeTone?: Tone;
	stats?: Stat[]; route?: RouteRef; action?: string; code?: boolean; chart?: Graph;
	/** Rankings: numeric sort keys in the order of the screen's `sort` labels (null sorts last). */
	keys?: (number | null)[];
}
export interface Section { title: string; rows: Row[] }
export interface Screen { v: 2; title: string; subtitle?: string; sections: Section[]; sort?: string[] }

export const f64 = (xs: readonly number[]) => Buffer.from(new Float64Array(xs).buffer).toString('base64');
export const f32 = (xs: readonly number[]) => Buffer.from(new Float32Array(xs.map(x => (Number.isFinite(x) ? x : NaN))).buffer).toString('base64');

/** At most `limit` points, keeping each bucket's lowest and highest value so spikes survive. */
export function thin<T extends { t: number; value: number }>(points: readonly T[], limit = 500): T[] {
	if (points.length <= limit) return [...points];
	const out = [points[0]!], buckets = Math.max(1, Math.floor((limit - 2) / 2)), stride = (points.length - 2) / buckets;
	for (let b = 0; b < buckets; b++) {
		const lo = 1 + Math.floor(b * stride), hi = Math.min(points.length - 1, 1 + Math.floor((b + 1) * stride));
		let min = lo, max = lo;
		for (let i = lo; i < hi; i++) { if (points[i]!.value < points[min]!.value) min = i; if (points[i]!.value > points[max]!.value) max = i; }
		for (const i of min < max ? [min, max] : max < min ? [max, min] : [min]) out.push(points[i]!);
	}
	out.push(points.at(-1)!);
	return out;
}
export function series(name: string, points: readonly { t: number; value: number }[], limit = 500): Series {
	const p = thin(points.filter(x => Number.isFinite(x.t) && Number.isFinite(x.value)), limit);
	return { name, t: f64(p.map(x => x.t)), v: f32(p.map(x => x.value)) };
}
export function candles(cs: readonly { t: number; open: number; high: number; low: number; close: number }[]) {
	return { t: f64(cs.map(c => c.t)), o: f32(cs.map(c => c.open)), h: f32(cs.map(c => c.high)), l: f32(cs.map(c => c.low)), c: f32(cs.map(c => c.close)) };
}

const TZ = 'Europe/Tirane';
export const tone = (n: number | null | undefined): Tone => (n == null || !Number.isFinite(n) ? 0 : n > 0 ? 1 : n < 0 ? -1 : 0);
export function num(n: number | null | undefined, digits = 2): string {
	if (n == null || !Number.isFinite(n)) return '—';
	// The typographic minus, like pct and pp ("Sharpe −1.24", not "-1.24").
	return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/^-/, '−');
}
export const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n) * 100, 1) + '%');
export const usd = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : (n < 0 ? '−$' : '$') + num(Math.abs(n)));
export const signedUsd = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : (n > 0 ? '+$' : n < 0 ? '−$' : '$') + num(Math.abs(n)));
export const pp = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n) * 100) + ' pp');
export const tier = (n: number | null | undefined) => (n ? `1:${n}` : 'Pre-tiers');
const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(kind: string, options: Intl.DateTimeFormatOptions) {
	let f = formatters.get(kind);
	if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...options }); formatters.set(kind, f); }
	return f;
}
/** "17 Nov 2026, 03:27" in the user's time zone (Tirana). */
export const date = (n: number | null | undefined) => (n && n > 0 ? fmt('date', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(n) : 'Not recorded');
/** "17 Nov 03:27:01" for trade times. */
export const moment = (n: number | null | undefined) => (n && n > 0 ? fmt('moment', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(n) : '—');
export const clock = (n: number | null | undefined) => (n && n > 0 ? fmt('clock', { hour: '2-digit', minute: '2-digit' }).format(n) : '—');
export const day = (n: number | null | undefined) => (n && n > 0 ? fmt('day', { day: 'numeric', month: 'short' }).format(n) : '—');
export function span(ms: number): string {
	if (!(ms > 0)) return '';
	const m = Math.round(ms / 60000);
	if (m < 60) return `${m}m`;
	const h = m / 60;
	return h < 48 ? `${num(h, h < 10 ? 1 : 0)}h` : `${num(h / 24, 1)}d`;
}
/** Removes empty optional fields so the document stays small. */
export function compact<T extends object>(o: T): T {
	for (const [k, v] of Object.entries(o)) if (v === undefined || v === '' || v === null || (Array.isArray(v) && !v.length)) delete (o as Record<string, unknown>)[k];
	return o;
}

import { defineAgent } from '../src/sdk';

/**
 * Five turtle-style breakout systems averaged into one position (Hoffstein's
 * "specification risk"; Carver's forecast combination): each sub-system goes
 * long on a close above its n-day high and out on a close below its m-day low,
 * for (n, m) = (10, 5), (20, 10), (55, 20), (100, 50), (200, 100). The position
 * is the share of sub-systems that are long, scaled to 25% annual volatility and
 * capped at 0.9× equity, so no single lookback decides. Trend in crypto is the
 * most persistent trend evidence in recent practitioner work (Concretum 2025).
 * Long-only on the 1:1 account: no overnight fee, no margin call.
 */
export default defineAgent({
  name: 'Donchian Ensemble',
  description: 'Averages five breakout systems (10 to 200 days) into one long-only position, volatility-scaled, on BTC and ETH at 1:1.',
  author: 'claude',
  instruments: ['BTCUSD', 'ETHUSD'],
  timeframe: '1d',
  leverage: [1],
  params: { targetVol: 25, volBars: 60, maxExposure: 0.9, minChange: 0.2 },
  init: () => ({ long: [false, false, false, false, false] }),
  warmup: 201,
  onBar(ctx) {
    const { targetVol, volBars, maxExposure, minChange } = ctx.params;
    const price = ctx.bar.close;
    const s = ctx.state;
    SYSTEMS.forEach(([entry, exit], k) => {
      // Breakouts of the previous n bars (donchian includes the current bar).
      const high = ctx.ta.series.donchian(entry).upper.at(-2)!;
      const low = ctx.ta.series.donchian(exit).lower.at(-2)!;
      if (!s.long[k] && price > high) s.long[k] = true;
      else if (s.long[k] && price < low) s.long[k] = false;
    });
    const signal = s.long.filter(Boolean).length / SYSTEMS.length;
    const vol = annualVol(ctx.bars, volBars);
    if (!Number.isFinite(vol) || vol <= 0) return;
    const target = signal * Math.min(maxExposure, targetVol / vol);
    const current = ctx.position ? (ctx.position.size * price) / ctx.equity : 0;
    if (target === 0) {
      if (ctx.position) ctx.close('every breakout system is out');
      return;
    }
    // Resizing is a close and reopen, so only when the target has moved enough.
    if (ctx.position && Math.abs(target - current) < minChange) return;
    if (ctx.position) ctx.close('resize');
    ctx.buy({ exposure: target, reason: `${signal * SYSTEMS.length} of ${SYSTEMS.length} systems long, volatility ${vol.toFixed(0)}%: ${target.toFixed(2)}× equity` });
  },
});

const SYSTEMS: readonly (readonly [number, number])[] = [
  [10, 5],
  [20, 10],
  [55, 20],
  [100, 50],
  [200, 100],
];
const YEAR_MS = 365.25 * 86_400_000;

/** Annualised volatility (%) of the last `n` bar-to-bar log returns, scaled by calendar time. */
function annualVol(bars: readonly { time: number; close: number }[], n: number): number {
  if (bars.length <= n) return NaN;
  let sumSq = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const r = Math.log(bars[i]!.close / bars[i - 1]!.close);
    sumSq += r * r;
  }
  return Math.sqrt((sumSq * YEAR_MS) / (bars.at(-1)!.time - bars.at(-1 - n)!.time)) * 100;
}

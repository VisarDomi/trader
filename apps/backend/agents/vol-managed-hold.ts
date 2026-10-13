import { defineAgent } from '../src/sdk';

/**
 * Volatility-managed buy-and-hold (Moreira & Muir, "Volatility-Managed
 * Portfolios", 2017) on the fee-free legs of the 1:1 account: hold full size
 * (0.9× equity, the 1:1 maximum) while the last month's volatility is at or
 * below the last year's, and scale down in proportion when it is above.
 * Volatility clusters while returns barely rise with it, so cutting exposure in
 * turbulent months has historically improved the Sharpe ratio and the drawdown
 * more than the return. Re-checked every Monday; resized (close and reopen)
 * only when the target moved by 0.15× or more. The benchmark is buy-hold on the
 * same instruments and account.
 */
export default defineAgent({
  name: 'Volatility-Managed Hold',
  description: 'Holds the 8 largest Nasdaq shares, BTC and ETH at 1:1, scaled down when the last month is more volatile than the last year.',
  author: 'claude',
  instruments: ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'AVGO', 'META', 'GOOGL', 'TSLA', 'BTCUSD', 'ETHUSD'],
  timeframe: '1d',
  leverage: [1],
  params: { maxExposure: 0.9, shortBars: 21, longBars: 252, minChange: 0.15 },
  warmup: 253,
  onBar(ctx) {
    const { maxExposure, shortBars, longBars, minChange } = ctx.params;
    const bars = ctx.bars;
    // Daily bars are UTC days: the bar that just closed began on a Monday.
    if (new Date(ctx.bar.time).getUTCDay() !== 1 && ctx.position) return;
    const recent = annualVol(bars, shortBars);
    const normal = annualVol(bars, longBars);
    if (!Number.isFinite(recent) || !Number.isFinite(normal) || recent <= 0) return;
    const target = maxExposure * Math.min(1, normal / recent);
    const current = ctx.position ? (ctx.position.size * ctx.bar.close) / ctx.equity : 0;
    if (ctx.position && Math.abs(target - current) < minChange) return;
    if (ctx.position) ctx.close('resize');
    ctx.buy({ exposure: target, reason: `volatility ${recent.toFixed(0)}% last month vs ${normal.toFixed(0)}% last year: ${target.toFixed(2)}× equity` });
  },
});

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

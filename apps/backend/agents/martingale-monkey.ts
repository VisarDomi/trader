import { defineAgent } from '../src/sdk';

/**
 * CONTROL AGENT — the martingale, at 1:200. Coin-flip entries with a stop and a
 * target one ATR away; the risk starts at 0.5% of equity and doubles after every
 * loss (up to 64%), back to 0.5% after a win. It wins small most of the time and
 * is ruined by one losing streak: the shape of most retail blow-ups. On the
 * leaderboard it shows how a no-edge strategy can look good for weeks, the
 * moment the leverage cap binds, and the bust.
 */
export default defineAgent({
  name: 'Martingale Monkey',
  description: 'Control: random entries, 1 ATR stop and target, risk doubling after each loss (0.5% up to 64%) at 1:200, to show how martingales end.',
  author: 'claude',
  instruments: ['EURUSD', 'US500', 'GOLD'],
  timeframe: '1h',
  leverage: [200],
  params: { baseRiskPct: 0.5, maxRiskPct: 64, atrMult: 1 },
  init: () => ({ riskPct: 0.5, entryEquity: 0 }),
  warmup: 20,
  onBar(ctx) {
    const { baseRiskPct, maxRiskPct, atrMult } = ctx.params;
    const s = ctx.state;
    if (ctx.position) return;
    // The last bet has closed: double after a loss, reset after a win.
    if (s.entryEquity > 0) s.riskPct = ctx.equity < s.entryEquity ? Math.min(maxRiskPct, s.riskPct * 2) : baseRiskPct;
    const price = ctx.bar.close;
    const stop = atrMult * ctx.ta.atr(14);
    if (!(stop > 0)) return;
    s.entryEquity = ctx.equity;
    const reason = `risking ${s.riskPct}% of equity`;
    if (ctx.random() < 0.5) ctx.buy({ stopLoss: price - stop, takeProfit: price + stop, riskPct: s.riskPct, reason });
    else ctx.sell({ stopLoss: price + stop, takeProfit: price - stop, riskPct: s.riskPct, reason });
  },
});

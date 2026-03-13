/**
 * Batch runner v3 — trend follower sweep.
 *
 * Trend: 0.1% to 1.0% (10), TF: 1m/5m (2), Leverage: 20/200 (2), TP: 10-50% (5)
 * = 200 combinations on 2 years, starting capital $1000.
 *
 * Usage: bun run src/run/batch-v3.ts > results.csv 2> progress.log
 */

import { createAgentV2 } from '../../agents/trend-follower/factory-v2.ts';
import { AgentRunner } from '../core/agent/AgentRunner.ts';
import { BacktestFeed } from '../core/feed/BacktestFeed.ts';
import { SimulatedExecution } from '../core/execution/SimulatedExecution.ts';
import { MetricsEngine } from '../core/metrics/MetricsEngine.ts';
import { CandleRepository } from '../data/CandleRepository.ts';
import { fetchInstrument } from '../data/fetchInstrument.ts';
import type { Timeframe } from '../core/agent/types.ts';
import { sql } from '../data/db.ts';

const TIMEFRAMES: Timeframe[] = ['1m', '5m'];
const TREND_PCTS = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.001); // 0.1% to 1.0%
const TP_RETURNS = [0.10, 0.20, 0.30, 0.40, 0.50]; // 10% to 50% margin return
const LEVERAGES = [20, 200];
const CAPITAL = 1000;

const START = new Date('2024-02-10').getTime();
const END = new Date('2026-02-10').getTime();

const totalCombos = TIMEFRAMES.length * TREND_PCTS.length * TP_RETURNS.length * LEVERAGES.length;
console.error(`Running ${totalCombos} backtests (${TIMEFRAMES.length} TF × ${TREND_PCTS.length} trend × ${TP_RETURNS.length} TP × ${LEVERAGES.length} lev)`);
console.error(`Period: 2024-02-10 → 2026-02-10, capital: $${CAPITAL}`);

const baseInstrument = await fetchInstrument('US100');
const candles = await CandleRepository.loadMinuteCandles('US100', START, END);
console.error(`Loaded ${candles.length} minute candles.\n`);

console.log('leverage,timeframe,trend_pct,tp_margin_pct,trades,win_rate,start_capital,end_capital,pnl,max_dd,profit_factor,avg_win,avg_loss,sl_hits,tp_hits,mkt_close');

let completed = 0;
const t0 = Date.now();

for (const lev of LEVERAGES) {
  const instrument = { ...baseInstrument, leverage: lev };

  for (const tf of TIMEFRAMES) {
    for (const trendPct of TREND_PCTS) {
      for (const tpReturn of TP_RETURNS) {
        const trendLabel = (trendPct * 100).toFixed(1);
        const tpLabel = (tpReturn * 100).toFixed(0);

        const agent = createAgentV2({
          name: `v3-L${lev}-${tf}-t${trendLabel}-tp${tpLabel}`,
          timeframe: tf,
          trendPct,
          tpReturn,
        });

        const feed = new BacktestFeed([...candles]);
        const execution = new SimulatedExecution(instrument);

        const runner = new AgentRunner({
          agent,
          feed,
          execution,
          instrument,
          capital: CAPITAL,
        });

        const result = await runner.run();
        const metrics = MetricsEngine.calculate(result.fills, result.equityCurve, CAPITAL);

        const closes = result.fills.filter(f => f.action === 'CLOSED');
        const slHits = closes.filter(f => f.reason === 'STOP_LOSS').length;
        const tpHits = closes.filter(f => f.reason === 'TAKE_PROFIT').length;
        const mktClose = closes.filter(f => f.reason === 'MARKET_CLOSE').length;
        const endCapital = CAPITAL + metrics.totalPnL;

        console.log([
          lev, tf, trendLabel, tpLabel,
          metrics.totalTrades,
          (metrics.winRate * 100).toFixed(1),
          CAPITAL,
          endCapital.toFixed(2),
          metrics.totalPnL.toFixed(2),
          (metrics.maxDrawdown * 100).toFixed(1),
          metrics.profitFactor.toFixed(2),
          metrics.averageWin.toFixed(2),
          metrics.averageLoss.toFixed(2),
          slHits, tpHits, mktClose,
        ].join(','));

        completed++;
        if (completed % 20 === 0) {
          const elapsed = (Date.now() - t0) / 1000;
          const rate = completed / elapsed;
          const remaining = (totalCombos - completed) / rate;
          console.error(`  ${completed}/${totalCombos} done (${rate.toFixed(1)}/s, ~${remaining.toFixed(0)}s remaining)`);
        }
      }
    }
  }
}

const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
console.error(`\nAll ${totalCombos} backtests completed in ${totalTime}s.`);
await sql.close();

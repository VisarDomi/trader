/**
 * Batch runner v2b — granular TP sweep (1-10%), wider trend (0.1-2.0%).
 *
 * Usage: bun run src/run/batch-v2b.ts
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

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h'];
// 0.1% to 2.0% in 0.1% steps = 20 values
const TREND_PCTS = Array.from({ length: 20 }, (_, i) => (i + 1) * 0.001);
// 1% to 10% margin return in 1% steps = 10 values
const TP_RETURNS = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.01);

const LEVERAGE = 20;
const CAPITAL = 10000;

const END_DATE = new Date('2026-02-10');
const START_DATE = new Date(END_DATE.getTime() - 14 * 86400000);

const startMs = START_DATE.getTime();
const endMs = END_DATE.getTime();

const totalCombos = TIMEFRAMES.length * TREND_PCTS.length * TP_RETURNS.length;
console.error(`Running ${totalCombos} backtests (${TIMEFRAMES.length} TF × ${TREND_PCTS.length} trend × ${TP_RETURNS.length} TP)...`);
console.error(`Period: ${START_DATE.toISOString().slice(0, 10)} → ${END_DATE.toISOString().slice(0, 10)}`);

const baseInstrument = await fetchInstrument('US100');
const instrument = { ...baseInstrument, leverage: LEVERAGE };
const candles = await CandleRepository.loadMinuteCandles('US100', startMs, endMs);
console.error(`Loaded ${candles.length} minute candles.`);

console.log('timeframe,trend_pct,tp_margin_pct,trades,win_rate,start_capital,end_capital,pnl,max_dd,profit_factor,avg_win,avg_loss,sl_hits,tp_hits,mkt_close');

let completed = 0;
const batchStartTime = Date.now();

for (const tf of TIMEFRAMES) {
  for (const trendPct of TREND_PCTS) {
    for (const tpReturn of TP_RETURNS) {
      const trendLabel = (trendPct * 100).toFixed(1);
      const tpLabel = (tpReturn * 100).toFixed(0);

      const agent = createAgentV2({
        name: `v2b-${tf}-t${trendLabel}-tp${tpLabel}`,
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
        tf, trendLabel, tpLabel,
        metrics.totalTrades,
        (metrics.winRate * 100).toFixed(1),
        CAPITAL,
        endCapital.toFixed(0),
        metrics.totalPnL.toFixed(0),
        (metrics.maxDrawdown * 100).toFixed(1),
        metrics.profitFactor.toFixed(2),
        metrics.averageWin.toFixed(0),
        metrics.averageLoss.toFixed(0),
        slHits, tpHits, mktClose,
      ].join(','));

      completed++;
      if (completed % 100 === 0) {
        const elapsed = (Date.now() - batchStartTime) / 1000;
        const rate = completed / elapsed;
        const remaining = (totalCombos - completed) / rate;
        console.error(`  ${completed}/${totalCombos} done (${rate.toFixed(1)}/s, ~${remaining.toFixed(0)}s remaining)`);
      }
    }
  }
}

const totalTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
console.error(`\nAll ${totalCombos} backtests completed in ${totalTime}s.`);
await sql.close();

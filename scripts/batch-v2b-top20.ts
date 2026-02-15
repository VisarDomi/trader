/**
 * Run the top 20 agents from the 2-week sweep on the full 2-year period.
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

const LEVERAGE = 20;
const CAPITAL = 10000;
const START = new Date('2024-02-10').getTime();
const END = new Date('2026-02-10').getTime();

// Top 20 from 2-week sweep: [timeframe, trendPct, tpReturn (margin %)]
const TOP20: [Timeframe, number, number][] = [
  ['5m',  0.006, 0.04],
  ['1m',  0.006, 0.07],
  ['5m',  0.006, 0.03],
  ['1m',  0.020, 0.09],
  ['5m',  0.019, 0.09],
  ['5m',  0.019, 0.10],
  ['5m',  0.020, 0.10],
  ['15m', 0.018, 0.10],
  ['15m', 0.020, 0.10],
  ['15m', 0.019, 0.10],
  ['1m',  0.020, 0.10],
  ['1m',  0.006, 0.01],
  ['1h',  0.005, 0.02],
  ['5m',  0.019, 0.08],
  ['1m',  0.020, 0.08],
  ['5m',  0.020, 0.09],
  ['15m', 0.020, 0.09],
  ['15m', 0.019, 0.09],
  ['15m', 0.018, 0.09],
  ['1h',  0.001, 0.02],
];

console.error(`Running ${TOP20.length} backtests on 2 years (2024-02-10 → 2026-02-10)...`);

const baseInstrument = await fetchInstrument('US100');
const instrument = { ...baseInstrument, leverage: LEVERAGE };
const candles = await CandleRepository.loadMinuteCandles('US100', START, END);
console.error(`Loaded ${candles.length} minute candles.`);

console.log('timeframe,trend_pct,tp_margin_pct,trades,win_rate,start_capital,end_capital,pnl,max_dd,profit_factor,avg_win,avg_loss,sl_hits,tp_hits,mkt_close');

const t0 = Date.now();

for (let i = 0; i < TOP20.length; i++) {
  const [tf, trendPct, tpReturn] = TOP20[i];
  const trendLabel = (trendPct * 100).toFixed(1);
  const tpLabel = (tpReturn * 100).toFixed(0);

  const agent = createAgentV2({
    name: `top20-${tf}-t${trendLabel}-tp${tpLabel}`,
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

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.error(`  ${i + 1}/${TOP20.length} (${elapsed}s): ${tf} t${trendLabel}% tp${tpLabel}% → $${endCapital.toFixed(0)}`);
}

console.error(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
await sql.close();

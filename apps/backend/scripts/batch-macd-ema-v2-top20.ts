/**
 * Re-run top 20 MACD+EMA configs on full history (from ~10k price onward).
 *
 * Usage: bun run src/run/batch-macd-ema-v2-top20.ts > results.csv 2> progress.log
 */

import { createMacdEmaAgent } from '../../agents/macd-ema/factory.ts';
import { AgentRunner } from '../core/agent/AgentRunner.ts';
import { BacktestFeed } from '../core/feed/BacktestFeed.ts';
import { SimulatedExecution } from '../core/execution/SimulatedExecution.ts';
import { MetricsEngine } from '../core/metrics/MetricsEngine.ts';
import { CandleRepository } from '../data/CandleRepository.ts';
import { fetchInstrument } from '../data/fetchInstrument.ts';
import type { Timeframe } from '../core/agent/types.ts';
import { sql } from '../data/db.ts';

// Top 20 configs from the 100-combo sweep (sorted by end capital)
const TOP20 = [
  { tf: '1m' as Timeframe, ema: 50,  sl: -0.10, tp: 0.20 },
  { tf: '1m' as Timeframe, ema: 200, sl: -0.10, tp: 0.20 },
  { tf: '5m' as Timeframe, ema: 50,  sl: -0.10, tp: 0.20 },
  { tf: '5m' as Timeframe, ema: 50,  sl: -0.50, tp: 0.50 },
  { tf: '5m' as Timeframe, ema: 200, sl: -0.10, tp: 0.20 },
  { tf: '5m' as Timeframe, ema: 50,  sl: -0.50, tp: 0.40 },
  { tf: '5m' as Timeframe, ema: 200, sl: -0.10, tp: 0.40 },
  { tf: '1m' as Timeframe, ema: 50,  sl: -0.10, tp: 0.40 },
  { tf: '5m' as Timeframe, ema: 50,  sl: -0.30, tp: 0.30 },
  { tf: '5m' as Timeframe, ema: 200, sl: -0.10, tp: 0.30 },
  { tf: '1m' as Timeframe, ema: 50,  sl: -0.10, tp: 0.30 },
  { tf: '5m' as Timeframe, ema: 50,  sl: -0.30, tp: 0.20 },
  { tf: '1m' as Timeframe, ema: 50,  sl: -0.10, tp: 0.50 },
  { tf: '1m' as Timeframe, ema: 50,  sl: -0.20, tp: 0.50 },
  { tf: '1m' as Timeframe, ema: 200, sl: -0.10, tp: 0.30 },
  { tf: '5m' as Timeframe, ema: 50,  sl: -0.40, tp: 0.50 },
  { tf: '1m' as Timeframe, ema: 200, sl: -0.50, tp: 0.50 },
  { tf: '5m' as Timeframe, ema: 50,  sl: -0.50, tp: 0.30 },
  { tf: '1m' as Timeframe, ema: 50,  sl: -0.10, tp: 0.10 },
  { tf: '5m' as Timeframe, ema: 200, sl: -0.10, tp: 0.10 },
];

const LEVERAGE = 20;
const CAPITAL = 1000;

// US100 first hit ~10,000 on 2020-06-09
const START = new Date('2020-06-09').getTime();
const END = new Date('2026-02-10').getTime();

console.error(`Running top 20 MACD+EMA configs on extended history`);
console.error(`Period: 2020-06-09 → 2026-02-10 (~5.7 years), leverage: ${LEVERAGE}, capital: $${CAPITAL}`);

const baseInstrument = await fetchInstrument('US100');
const instrument = { ...baseInstrument, leverage: LEVERAGE };
const candles = await CandleRepository.loadMinuteCandles('US100', START, END);
console.error(`Loaded ${candles.length} minute candles.\n`);

console.log('leverage,timeframe,ema_period,sl_margin_pct,tp_margin_pct,trades,win_rate,start_capital,end_capital,pnl,max_dd,profit_factor,avg_win,avg_loss,sl_hits,tp_hits,mkt_close');

let completed = 0;
const t0 = Date.now();

for (const cfg of TOP20) {
  const slLabel = (Math.abs(cfg.sl) * 100).toFixed(0);
  const tpLabel = (cfg.tp * 100).toFixed(0);

  const agent = createMacdEmaAgent({
    name: `macd-ema${cfg.ema}-${cfg.tf}-sl${slLabel}-tp${tpLabel}`,
    timeframe: cfg.tf,
    emaPeriod: cfg.ema,
    tpReturn: cfg.tp,
    slReturn: cfg.sl,
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
    LEVERAGE, cfg.tf, cfg.ema, slLabel, tpLabel,
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
  const elapsed = (Date.now() - t0) / 1000;
  const rate = completed / elapsed;
  const remaining = (TOP20.length - completed) / rate;
  console.error(`  ${completed}/${TOP20.length} (${rate.toFixed(1)}/s, ~${remaining.toFixed(0)}s): ema${cfg.ema} ${cfg.tf} sl${slLabel}% tp${tpLabel}% → $${endCapital.toFixed(2)}`);
}

const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
console.error(`\nAll ${TOP20.length} backtests completed in ${totalTime}s.`);
await sql.close();

/**
 * Batch runner — MACD + EMA trend filter agent.
 *
 * EMA period: 50, 100, 200 (3)
 * TP: 10%-50% (5)
 * TF: 1m, 5m (2)
 * Leverage: 20
 * = 30 combinations, 2 years, $1000 starting capital.
 *
 * Usage: bun run src/run/batch-macd-ema.ts > results.csv 2> progress.log
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

const TIMEFRAMES: Timeframe[] = ['1m', '5m'];
const EMA_PERIODS = [50, 100, 200];
const TP_RETURNS = [0.10, 0.20, 0.30, 0.40, 0.50];
const LEVERAGE = 20;
const CAPITAL = 1000;

const START = new Date('2024-02-10').getTime();
const END = new Date('2026-02-10').getTime();

const totalCombos = TIMEFRAMES.length * EMA_PERIODS.length * TP_RETURNS.length;
console.error(`Running ${totalCombos} MACD+EMA backtests (${TIMEFRAMES.length} TF × ${EMA_PERIODS.length} EMA × ${TP_RETURNS.length} TP)`);
console.error(`Period: 2024-02-10 → 2026-02-10, leverage: ${LEVERAGE}, capital: $${CAPITAL}`);

const baseInstrument = await fetchInstrument('US100');
const instrument = { ...baseInstrument, leverage: LEVERAGE };
const candles = await CandleRepository.loadMinuteCandles('US100', START, END);
console.error(`Loaded ${candles.length} minute candles.\n`);

console.log('leverage,timeframe,ema_period,tp_margin_pct,trades,win_rate,start_capital,end_capital,pnl,max_dd,profit_factor,avg_win,avg_loss,sl_hits,tp_hits,mkt_close');

let completed = 0;
const t0 = Date.now();

for (const tf of TIMEFRAMES) {
  for (const emaPeriod of EMA_PERIODS) {
    for (const tpReturn of TP_RETURNS) {
      const tpLabel = (tpReturn * 100).toFixed(0);

      const agent = createMacdEmaAgent({
        name: `macd-ema${emaPeriod}-${tf}-tp${tpLabel}`,
        timeframe: tf,
        emaPeriod,
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
        LEVERAGE, tf, emaPeriod, tpLabel,
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
      const remaining = (totalCombos - completed) / rate;
      console.error(`  ${completed}/${totalCombos} (${rate.toFixed(1)}/s, ~${remaining.toFixed(0)}s): ema${emaPeriod} ${tf} tp${tpLabel}% → $${endCapital.toFixed(2)}`);
    }
  }
}

const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
console.error(`\nAll ${totalCombos} backtests completed in ${totalTime}s.`);
await sql.close();

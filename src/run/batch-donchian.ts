/**
 * Monte Carlo sweep for Donchian Channel Breakout agent.
 *
 * 108 combinations: 3 channels × 3 SL × 3 RR × 2 timeframes × 2 leverages.
 * Period: last 3 years of US100 data.
 *
 * 1m agents: SyntheticTickFeed (600 ticks/candle for sub-minute SL/TP).
 * 5m agents: BacktestFeed (1m candles give 5 real checks per 5m period).
 * All runs use realistic bidirectional slippage (200–500ms delay).
 *
 * Usage: bun run src/run/batch-donchian.ts > results.csv
 */

import { createDonchian } from '../../agents/donchian-breakout/factory.ts';
import { AgentRunner } from '../core/agent/AgentRunner.ts';
import { BacktestFeed } from '../core/feed/BacktestFeed.ts';
import { SyntheticTickFeed } from '../core/feed/SyntheticTickFeed.ts';
import { SimulatedExecution } from '../core/execution/SimulatedExecution.ts';
import { MetricsEngine } from '../core/metrics/MetricsEngine.ts';
import { CandleRepository } from '../data/CandleRepository.ts';
import { getInstrument } from '../data/instruments.ts';
import type { Timeframe } from '../core/agent/types.ts';
import { sql } from '../data/db.ts';

// --- Parameter grid ---
const CHANNEL_LENGTHS = [20, 50, 100];
const ATR_MULTIPLES = [1.0, 2.0, 3.0];
const REWARD_RATIOS = [1.5, 2.0, 3.0];
const TIMEFRAMES: Timeframe[] = ['1m', '5m'];
const LEVERAGES = [20, 200];

const CAPITAL = 10_000;
const MAX_DRAWDOWN = 0.50;

// Last 3 years
const END_DATE = new Date('2026-02-13');
const START_DATE = new Date('2023-02-13');
const startMs = START_DATE.getTime();
const endMs = END_DATE.getTime();

const totalCombos = CHANNEL_LENGTHS.length * ATR_MULTIPLES.length * REWARD_RATIOS.length
  * TIMEFRAMES.length * LEVERAGES.length;

console.error(`Donchian Breakout Monte Carlo: ${totalCombos} combinations`);
console.error(`Period: ${START_DATE.toISOString().slice(0, 10)} → ${END_DATE.toISOString().slice(0, 10)}`);

// Load candles once
const baseInstrument = getInstrument('US100')!;
const candles = await CandleRepository.loadMinuteCandles('US100', startMs, endMs);
console.error(`Loaded ${candles.length.toLocaleString()} minute candles.\n`);

// CSV header
console.log([
  'timeframe', 'leverage', 'channel', 'atr_mult', 'rr_ratio',
  'trades', 'win_rate', 'pnl', 'return_pct', 'max_dd', 'sharpe',
  'profit_factor', 'avg_win', 'avg_loss', 'sl_hits', 'tp_hits', 'mkt_close',
].join(','));

let completed = 0;
const batchStart = Date.now();

for (const tf of TIMEFRAMES) {
  for (const leverage of LEVERAGES) {
    for (const channel of CHANNEL_LENGTHS) {
      for (const atrMult of ATR_MULTIPLES) {
        for (const rr of REWARD_RATIOS) {
          const label = `${tf}-L${leverage}-ch${channel}-atr${atrMult}-rr${rr}`;

          const instrument = { ...baseInstrument, leverage };

          const agent = createDonchian({
            name: label,
            timeframe: tf,
            channelLength: channel,
            atrMultiple: atrMult,
            rewardRatio: rr,
          });

          const slippage = { type: 'realistic' as const };
          const execution = new SimulatedExecution(instrument, slippage);

          let runner: AgentRunner;

          if (tf === '1m') {
            // SyntheticTickFeed: generates 600 ticks per minute candle
            // We need a temporary runner reference for the onTick callback
            let tickRunner: AgentRunner;

            const feed = new SyntheticTickFeed({
              candles: [...candles],
              instrument,
              onTick: (bid, ask, ts) => tickRunner.processTick(bid, ask, ts),
            });

            tickRunner = new AgentRunner({
              agent,
              feed,
              execution,
              instrument,
              capital: CAPITAL,
              maxDrawdown: MAX_DRAWDOWN,
            });

            runner = tickRunner;
          } else {
            // 5m: plain BacktestFeed — 1m candles give 5 real SL/TP checks per period
            const feed = new BacktestFeed([...candles]);

            runner = new AgentRunner({
              agent,
              feed,
              execution,
              instrument,
              capital: CAPITAL,
              maxDrawdown: MAX_DRAWDOWN,
            });
          }

          const result = await runner.run();
          const metrics = MetricsEngine.calculate(result.fills, result.equityCurve, CAPITAL);

          const closes = result.fills.filter(f => f.action === 'CLOSED');
          const slHits = closes.filter(f => f.reason === 'STOP_LOSS').length;
          const tpHits = closes.filter(f => f.reason === 'TAKE_PROFIT').length;
          const mktClose = closes.filter(f => f.reason === 'MARKET_CLOSE').length;

          console.log([
            tf, leverage, channel, atrMult, rr,
            metrics.totalTrades,
            (metrics.winRate * 100).toFixed(1),
            metrics.totalPnL.toFixed(0),
            (metrics.totalReturn * 100).toFixed(1),
            (metrics.maxDrawdown * 100).toFixed(1),
            metrics.sharpe.toFixed(2),
            metrics.profitFactor.toFixed(2),
            metrics.averageWin.toFixed(0),
            metrics.averageLoss.toFixed(0),
            slHits, tpHits, mktClose,
          ].join(','));

          completed++;
          if (completed % 10 === 0 || completed === totalCombos) {
            const elapsed = (Date.now() - batchStart) / 1000;
            const rate = completed / elapsed;
            const remaining = (totalCombos - completed) / rate;
            console.error(`  ${completed}/${totalCombos} (${rate.toFixed(1)}/s, ~${remaining.toFixed(0)}s remaining)`);
          }
        }
      }
    }
  }
}

const totalTime = ((Date.now() - batchStart) / 1000).toFixed(1);
console.error(`\nDone. ${totalCombos} backtests in ${totalTime}s.`);

await sql.close();

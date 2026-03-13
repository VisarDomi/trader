/**
 * Donchian timeframe deep-dive.
 *
 * The two best combos from the Monte Carlo (ch100, ATR×3, RR×3)
 * at leverages 20 and 200, now tested across 1m, 5m, 15m, 1h.
 * 8 runs total.
 *
 * Usage: bun run src/run/batch-donchian-tf.ts
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

// Fixed params from the best Monte Carlo result
const CHANNEL = 100;
const ATR_MULT = 3.0;
const RR_RATIO = 3.0;
const CAPITAL = 10_000;

// Dimensions to sweep
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h'];
const LEVERAGES = [20, 200];

// Last 3 years
const END_DATE = new Date('2026-02-13');
const START_DATE = new Date('2023-02-13');

const baseInstrument = getInstrument('US100')!;
const candles = await CandleRepository.loadMinuteCandles('US100', START_DATE.getTime(), END_DATE.getTime());
console.error(`Loaded ${candles.length.toLocaleString()} minute candles (${START_DATE.toISOString().slice(0, 10)} → ${END_DATE.toISOString().slice(0, 10)})\n`);

const total = TIMEFRAMES.length * LEVERAGES.length;
console.error(`Running ${total} backtests: ch${CHANNEL} ATR×${ATR_MULT} RR×${RR_RATIO}\n`);

// Header
console.log([
  'timeframe', 'leverage', 'trades', 'win_rate', 'pnl', 'return_pct',
  'max_dd', 'sharpe', 'profit_factor', 'avg_win', 'avg_loss',
  'sl_hits', 'tp_hits', 'mkt_close', 'liquidations',
].join(','));

const batchStart = Date.now();

for (const tf of TIMEFRAMES) {
  for (const leverage of LEVERAGES) {
    const label = `${tf}-L${leverage}`;
    const instrument = { ...baseInstrument, leverage };

    const agent = createDonchian({
      name: label,
      timeframe: tf,
      channelLength: CHANNEL,
      atrMultiple: ATR_MULT,
      rewardRatio: RR_RATIO,
    });

    const slippage = { type: 'realistic' as const };
    const execution = new SimulatedExecution(instrument, slippage);

    let runner: AgentRunner;

    if (tf === '1m') {
      let tickRunner: AgentRunner;
      const feed = new SyntheticTickFeed({
        candles: [...candles],
        instrument,
        onTick: (bid, ask, ts) => tickRunner.processTick(bid, ask, ts),
      });
      tickRunner = new AgentRunner({ agent, feed, execution, instrument, capital: CAPITAL });
      runner = tickRunner;
    } else {
      const feed = new BacktestFeed([...candles]);
      runner = new AgentRunner({ agent, feed, execution, instrument, capital: CAPITAL });
    }

    const t0 = Date.now();
    const result = await runner.run();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const metrics = MetricsEngine.calculate(result.fills, result.equityCurve, CAPITAL);

    const closes = result.fills.filter(f => f.action === 'CLOSED');
    const slHits = closes.filter(f => f.reason === 'STOP_LOSS').length;
    const tpHits = closes.filter(f => f.reason === 'TAKE_PROFIT').length;
    const mktClose = closes.filter(f => f.reason === 'MARKET_CLOSE').length;
    const liquidations = closes.filter(f => f.reason === 'LIQUIDATION').length;

    console.log([
      tf, leverage, metrics.totalTrades,
      (metrics.winRate * 100).toFixed(1),
      metrics.totalPnL.toFixed(0),
      (metrics.totalReturn * 100).toFixed(1),
      (metrics.maxDrawdown * 100).toFixed(1),
      metrics.sharpe.toFixed(2),
      metrics.profitFactor.toFixed(2),
      metrics.averageWin.toFixed(0),
      metrics.averageLoss.toFixed(0),
      slHits, tpHits, mktClose, liquidations,
    ].join(','));

    console.error(`  ${label}: ${metrics.totalTrades} trades, PnL $${metrics.totalPnL.toFixed(0)}, ${elapsed}s`);
  }
}

const totalTime = ((Date.now() - batchStart) / 1000).toFixed(1);
console.error(`\nDone in ${totalTime}s.`);
await sql.close();

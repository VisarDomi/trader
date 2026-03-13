/**
 * Donchian top-10 timeframe expansion.
 *
 * The top 10 configs from the 108-sweep (sorted by PnL desc),
 * now tested across 1m, 5m, 1h, 4h using ALL available history.
 * 10 configs × 4 timeframes = 40 runs.
 *
 * Usage: bun run src/run/batch-donchian-top10.ts
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

const CAPITAL = 10_000;

// Top 10 from 108-sweep, sorted by PnL descending
const CONFIGS = [
  { channel: 100, atrMult: 3, rr: 3,   leverage: 20  },
  { channel: 100, atrMult: 3, rr: 3,   leverage: 200 },
  { channel: 100, atrMult: 3, rr: 2,   leverage: 20  },
  { channel: 100, atrMult: 3, rr: 1.5, leverage: 20  },
  { channel: 100, atrMult: 2, rr: 3,   leverage: 20  },
  { channel: 100, atrMult: 3, rr: 1.5, leverage: 200 },
  { channel: 100, atrMult: 3, rr: 2,   leverage: 200 },
  { channel: 100, atrMult: 2, rr: 3,   leverage: 200 },
  { channel: 100, atrMult: 2, rr: 2,   leverage: 20  },
  { channel: 50,  atrMult: 3, rr: 3,   leverage: 20  },
];

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '1h', '4h'];

// All available history
const START_DATE = new Date('2020-02-11');
const END_DATE = new Date('2026-02-11');

const baseInstrument = getInstrument('US100')!;
const candles = await CandleRepository.loadMinuteCandles('US100', START_DATE.getTime(), END_DATE.getTime());
console.error(`Loaded ${candles.length.toLocaleString()} minute candles (${START_DATE.toISOString().slice(0, 10)} → ${END_DATE.toISOString().slice(0, 10)})\n`);

const total = CONFIGS.length * TIMEFRAMES.length;
console.error(`Running ${total} backtests (top 10 × 4 timeframes)\n`);

// Header
console.log([
  'timeframe', 'leverage', 'channel', 'atr_mult', 'rr_ratio',
  'trades', 'win_rate', 'pnl', 'return_pct', 'max_dd', 'sharpe',
  'profit_factor', 'avg_win', 'avg_loss',
  'sl_hits', 'tp_hits', 'mkt_close', 'liquidations',
].join(','));

const batchStart = Date.now();
let done = 0;

for (const cfg of CONFIGS) {
  for (const tf of TIMEFRAMES) {
    const label = `ch${cfg.channel}-ATR${cfg.atrMult}-RR${cfg.rr}-L${cfg.leverage}-${tf}`;
    const instrument = { ...baseInstrument, leverage: cfg.leverage };

    const agent = createDonchian({
      name: label,
      timeframe: tf,
      channelLength: cfg.channel,
      atrMultiple: cfg.atrMult,
      rewardRatio: cfg.rr,
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
      tf, cfg.leverage, cfg.channel, cfg.atrMult, cfg.rr,
      metrics.totalTrades,
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

    done++;
    console.error(`  [${done}/${total}] ${label}: ${metrics.totalTrades} trades, PnL $${metrics.totalPnL.toFixed(0)}, ${elapsed}s`);
  }
}

const totalTime = ((Date.now() - batchStart) / 1000).toFixed(1);
console.error(`\nDone. ${total} backtests in ${totalTime}s.`);
await sql.close();

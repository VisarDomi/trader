/**
 * Trace individual trades for a specific Donchian config.
 * Outputs every fill with full detail, then we verify a sample
 * against actual candle data.
 *
 * Usage: bun run src/run/trace-donchian.ts
 */

import { createDonchian } from '../../agents/donchian-breakout/factory.ts';
import { AgentRunner } from '../core/agent/AgentRunner.ts';
import { BacktestFeed } from '../core/feed/BacktestFeed.ts';
import { SimulatedExecution } from '../core/execution/SimulatedExecution.ts';
import { MetricsEngine } from '../core/metrics/MetricsEngine.ts';
import { CandleRepository } from '../data/CandleRepository.ts';
import { getInstrument } from '../data/instruments.ts';
import { sql } from '../data/db.ts';

// The suspicious config: ch100/ATR2/RR3/200×/1h
const CHANNEL = 100;
const ATR_MULT = 2;
const RR_RATIO = 3;
const LEVERAGE = 200;
const CAPITAL = 10_000;

const START_DATE = new Date('2020-02-11');
const END_DATE = new Date('2026-02-11');

const baseInstrument = getInstrument('US100')!;
const instrument = { ...baseInstrument, leverage: LEVERAGE };
const LOT_SIZE = instrument.lotSize;

const candles = await CandleRepository.loadMinuteCandles('US100', START_DATE.getTime(), END_DATE.getTime());
console.error(`Loaded ${candles.length.toLocaleString()} minute candles\n`);

const agent = createDonchian({
  name: 'trace',
  timeframe: '1h',
  channelLength: CHANNEL,
  atrMultiple: ATR_MULT,
  rewardRatio: RR_RATIO,
});

const slippage = { type: 'realistic' as const };
const execution = new SimulatedExecution(instrument, slippage);
const feed = new BacktestFeed([...candles]);
const runner = new AgentRunner({ agent, feed, execution, instrument, capital: CAPITAL });

const result = await runner.run();
const metrics = MetricsEngine.calculate(result.fills, result.equityCurve, CAPITAL);

console.error(`Total trades: ${metrics.totalTrades}, PnL: $${metrics.totalPnL.toFixed(0)}`);
console.error(`Win rate: ${(metrics.winRate * 100).toFixed(1)}%, Sharpe: ${metrics.sharpe.toFixed(2)}\n`);

// Pair up opens and closes
interface Trade {
  openFill: typeof result.fills[0];
  closeFill: typeof result.fills[0];
}

const trades: Trade[] = [];
for (let i = 0; i < result.fills.length; i++) {
  const fill = result.fills[i]!;
  if (fill.action === 'OPENED') {
    const close = result.fills[i + 1];
    if (close && close.action === 'CLOSED') {
      trades.push({ openFill: fill, closeFill: close });
      i++; // skip close
    }
  }
}

console.error(`Paired ${trades.length} trades\n`);

// Output all trades as CSV
console.log([
  'trade_num', 'open_time', 'close_time', 'side', 'size',
  'entry_price', 'exit_price', 'reason', 'pnl',
  'hold_minutes', 'liq_price',
].join(','));

for (let i = 0; i < trades.length; i++) {
  const t = trades[i]!;
  const holdMin = Math.round((t.closeFill.timestamp - t.openFill.timestamp) / 60_000);

  // Compute what the liquidation price would have been
  let liqPrice: number;
  if (t.openFill.side === 'BUY') {
    liqPrice = Math.round(t.openFill.price * (1 - 0.5 / LEVERAGE) * 10) / 10;
  } else {
    liqPrice = Math.round(t.openFill.price * (1 + 0.5 / LEVERAGE) * 10) / 10;
  }

  console.log([
    i + 1,
    new Date(t.openFill.timestamp).toISOString(),
    new Date(t.closeFill.timestamp).toISOString(),
    t.openFill.side,
    t.openFill.size.toFixed(4),
    t.openFill.price.toFixed(1),
    t.closeFill.price.toFixed(1),
    t.closeFill.reason,
    (t.closeFill.pnl ?? 0).toFixed(2),
    holdMin,
    liqPrice.toFixed(1),
  ].join(','));
}

// Now pick 5 specific trades to deep-verify against candle data:
// 1 TP hit, 1 SL hit, 2 liquidations (early + late), 1 market close
const tpTrade = trades.find(t => t.closeFill.reason === 'TAKE_PROFIT');
const slTrade = trades.find(t => t.closeFill.reason === 'STOP_LOSS');
const liqTrades = trades.filter(t => t.closeFill.reason === 'LIQUIDATION');
const earlyLiq = liqTrades[0];
const lateLiq = liqTrades[Math.floor(liqTrades.length / 2)];
const mktTrade = trades.find(t => t.closeFill.reason === 'MARKET_CLOSE');

const sample = [
  { label: 'TP_HIT', trade: tpTrade },
  { label: 'SL_HIT', trade: slTrade },
  { label: 'EARLY_LIQ', trade: earlyLiq },
  { label: 'MID_LIQ', trade: lateLiq },
  { label: 'MKT_CLOSE', trade: mktTrade },
].filter(s => s.trade);

console.error(`\n${'='.repeat(80)}`);
console.error(`DETAILED TRADE VERIFICATION (${sample.length} trades)`);
console.error(`${'='.repeat(80)}`);

for (const { label, trade } of sample) {
  if (!trade) continue;
  const t = trade;

  let liqPrice: number;
  if (t.openFill.side === 'BUY') {
    liqPrice = Math.round(t.openFill.price * (1 - 0.5 / LEVERAGE) * 10) / 10;
  } else {
    liqPrice = Math.round(t.openFill.price * (1 + 0.5 / LEVERAGE) * 10) / 10;
  }

  console.error(`\n--- ${label} ---`);
  console.error(`  Side:        ${t.openFill.side}`);
  console.error(`  Size:        ${t.openFill.size.toFixed(4)}`);
  console.error(`  Entry:       ${t.openFill.price.toFixed(1)} at ${new Date(t.openFill.timestamp).toISOString()}`);
  console.error(`  Exit:        ${t.closeFill.price.toFixed(1)} at ${new Date(t.closeFill.timestamp).toISOString()} (${t.closeFill.reason})`);
  console.error(`  PnL:         $${(t.closeFill.pnl ?? 0).toFixed(2)}`);
  console.error(`  Liq price:   ${liqPrice.toFixed(1)}`);

  // Query actual 1m candles around this trade
  const openTs = t.openFill.timestamp;
  const closeTs = t.closeFill.timestamp;
  // Get candles from 5 minutes before open to 5 minutes after close
  const padBefore = 5 * 60_000;
  const padAfter = 5 * 60_000;

  const tradeCandles = await sql`
    SELECT timestamp, open, high, low, close
    FROM candles
    WHERE instrument = 'US100'
      AND timestamp >= ${openTs - padBefore}
      AND timestamp <= ${closeTs + padAfter}
    ORDER BY timestamp
  `;

  console.error(`\n  1m candles around trade (${tradeCandles.length} candles):`);
  console.error(`  ${'timestamp'.padEnd(24)} ${'open'.padStart(9)} ${'high'.padStart(9)} ${'low'.padStart(9)} ${'close'.padStart(9)}  notes`);

  for (const c of tradeCandles) {
    const ts = Number(c.timestamp);
    const iso = new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
    const o = Number(c.open).toFixed(1);
    const h = Number(c.high).toFixed(1);
    const l = Number(c.low).toFixed(1);
    const cl = Number(c.close).toFixed(1);

    let notes = '';
    if (ts === openTs) notes += ' ← ENTRY CANDLE';
    if (ts === closeTs) notes += ' ← EXIT CANDLE';

    // Check if this candle would have breached liquidation
    if (t.openFill.side === 'BUY' && Number(c.low) <= liqPrice && ts > openTs && ts <= closeTs) {
      notes += ` ← LOW ${l} ≤ LIQ ${liqPrice.toFixed(1)}`;
    }
    if (t.openFill.side === 'SELL' && (Number(c.high) + instrument.spread) >= liqPrice && ts > openTs && ts <= closeTs) {
      notes += ` ← HIGH+SPREAD ${(Number(c.high) + instrument.spread).toFixed(1)} ≥ LIQ ${liqPrice.toFixed(1)}`;
    }

    // Check SL/TP breaches
    if (t.openFill.side === 'BUY') {
      if (Number(c.high) >= t.closeFill.price && t.closeFill.reason === 'TAKE_PROFIT' && ts > openTs && ts <= closeTs) {
        notes += ` ← HIGH ${h} ≥ TP ${t.closeFill.price.toFixed(1)}`;
      }
    }
    if (t.openFill.side === 'SELL') {
      if ((Number(c.low) + instrument.spread) <= t.closeFill.price && t.closeFill.reason === 'TAKE_PROFIT' && ts > openTs && ts <= closeTs) {
        notes += ` ← LOW+SPREAD ≤ TP ${t.closeFill.price.toFixed(1)}`;
      }
    }

    console.error(`  ${iso} ${o.padStart(9)} ${h.padStart(9)} ${l.padStart(9)} ${cl.padStart(9)}${notes}`);
  }

  // Verify PnL
  const expectedPnl = t.openFill.side === 'BUY'
    ? (t.closeFill.price - t.openFill.price) * t.openFill.size * LOT_SIZE
    : (t.openFill.price - t.closeFill.price) * t.openFill.size * LOT_SIZE;

  console.error(`\n  PnL verification:`);
  console.error(`    Reported PnL:   $${(t.closeFill.pnl ?? 0).toFixed(2)}`);
  console.error(`    Computed PnL:   $${expectedPnl.toFixed(2)} = (${t.closeFill.price.toFixed(1)} - ${t.openFill.price.toFixed(1)}) × ${t.openFill.size.toFixed(4)} × ${LOT_SIZE}`);
  console.error(`    Match: ${Math.abs(expectedPnl - (t.closeFill.pnl ?? 0)) < 0.01 ? 'YES ✓' : 'NO ✗ — BUG!'}`);

  // For liquidation trades, verify the liquidation price makes sense
  if (t.closeFill.reason === 'LIQUIDATION') {
    const actualExitVsLiq = Math.abs(t.closeFill.price - liqPrice);
    console.error(`    Exit vs Liq price gap: ${actualExitVsLiq.toFixed(1)} pts (should be 0 or near-0)`);
  }
}

console.error(`\n${'='.repeat(80)}`);
console.error(`DONE`);
console.error(`${'='.repeat(80)}`);

await sql.close();

/**
 * Compare the same agent across 3 feed modes for the same time period:
 *   1. Candle-only backtest (BacktestFeed)
 *   2. Real tick backtest (BacktestTickFeed)
 *   3. Synthetic tick backtest (SyntheticTickFeed)
 *
 * Uses the recorded tick data period and matching candle data.
 *
 * Usage: bun src/run/compare-feeds.ts
 */

import { AgentRunner, type RunResult } from '../core/agent/AgentRunner.ts';
import { BacktestFeed } from '../core/feed/BacktestFeed.ts';
import { BacktestTickFeed } from '../core/feed/BacktestTickFeed.ts';
import { SyntheticTickFeed } from '../core/feed/SyntheticTickFeed.ts';
import { SimulatedExecution } from '../core/execution/SimulatedExecution.ts';
import { MetricsEngine, type Metrics } from '../core/metrics/MetricsEngine.ts';
import { CandleRepository } from '../data/CandleRepository.ts';
import { TickRepository } from '../data/TickRepository.ts';
import { getInstrument } from '../data/instruments.ts';
import { createAgent } from '../../agents/trend-follower/factory.ts';
import { sql } from '../data/db.ts';

const INSTRUMENT_ID = 'US100';
const CAPITAL = 10_000;

async function main() {
  const instrument = getInstrument(INSTRUMENT_ID)!;

  // --- Part 1: Short period with real ticks (all 3 modes) ---
  // Use a tiny threshold so the agent actually trades in the small window.
  const tickAgent = createAgent({ name: 'Trend 1m 0.03%', timeframe: '1m', trendPct: 0.0003 });

  // Find tick data range
  const tickRange = await sql`
    SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts, COUNT(*) as cnt
    FROM ticks WHERE instrument = ${INSTRUMENT_ID}
  `;
  const tickStart = Number(tickRange[0].min_ts);
  const tickEnd = Number(tickRange[0].max_ts);
  const tickCount = Number(tickRange[0].cnt);

  console.log('========================================');
  console.log('  PART 1: Real tick period (3 modes)');
  console.log('========================================');
  console.log(`Agent:      ${tickAgent.config.name} (${tickAgent.config.primaryFeed})`);
  console.log(`Instrument: ${INSTRUMENT_ID}`);
  console.log(`Capital:    $${CAPITAL.toLocaleString()}`);
  console.log(`Period:     ${new Date(tickStart).toISOString()} → ${new Date(tickEnd).toISOString()}`);
  console.log(`Duration:   ${((tickEnd - tickStart) / 60_000).toFixed(1)} minutes`);
  console.log(`Tick data:  ${tickCount.toLocaleString()} ticks`);
  console.log('');

  // Load data for tick period
  const candles = await CandleRepository.loadMinuteCandles(INSTRUMENT_ID, tickStart, tickEnd);
  const ticks = await TickRepository.loadTicks(INSTRUMENT_ID, tickStart, tickEnd);

  console.log(`Candles loaded: ${candles.length} (1m)`);
  console.log(`Ticks loaded:   ${ticks.length}`);
  console.log('');

  if (candles.length === 0) {
    console.error('No candle data for this period. Run ingestion first.');
    await sql.close();
    process.exit(1);
  }

  // --- Mode 1: Candle-only ---
  console.log('--- Mode 1: Candle-only (BacktestFeed) ---');
  await runWithFeed('candle', () => {
    const feed = new BacktestFeed(candles);
    const execution = new SimulatedExecution(instrument, { type: 'realistic' });
    const runner = new AgentRunner({
      agent: tickAgent, feed, execution, instrument, capital: CAPITAL,
    });
    return { runner, feed };
  });

  // --- Mode 2: Real ticks ---
  if (ticks.length > 0) {
    console.log('--- Mode 2: Real ticks (BacktestTickFeed) ---');
    await runWithFeed('real-tick', () => {
      const execution = new SimulatedExecution(instrument, { type: 'realistic' });
      const runner = new AgentRunner({
        agent: tickAgent, feed: null!, execution, instrument, capital: CAPITAL,
      });
      const feed = new BacktestTickFeed(
        ticks,
        (bid, ask, ts) => runner.processTick(bid, ask, ts),
      );
      (runner as any).feed = feed;
      return { runner, feed };
    });
  } else {
    console.log('--- Mode 2: Real ticks — SKIPPED (no tick data) ---\n');
  }

  // --- Mode 3: Synthetic ticks ---
  console.log('--- Mode 3: Synthetic ticks (SyntheticTickFeed) ---');
  await runWithFeed('synthetic-tick', () => {
    const execution = new SimulatedExecution(instrument, { type: 'realistic' });
    const runner = new AgentRunner({
      agent: tickAgent, feed: null!, execution, instrument, capital: CAPITAL,
    });
    const feed = new SyntheticTickFeed({
      candles,
      instrument,
      onTick: (bid, ask, ts) => runner.processTick(bid, ask, ts),
    });
    (runner as any).feed = feed;
    return { runner, feed };
  });

  // --- Part 2: Longer period, candle vs synthetic-tick ---
  const agent = createAgent({ name: 'Trend 1m 0.25%', timeframe: '1m', trendPct: 0.0025 });
  const longStart = new Date('2026-02-03').getTime();
  const longEnd = new Date('2026-02-08').getTime();
  const longCandles = await CandleRepository.loadMinuteCandles(INSTRUMENT_ID, longStart, longEnd);

  console.log('========================================');
  console.log('  PART 2: 1-week candle vs synthetic');
  console.log('========================================');
  console.log(`Agent:      ${agent.config.name} (${agent.config.primaryFeed})`);
  console.log(`Period:     2026-02-03 → 2026-02-08`);
  console.log(`Candles:    ${longCandles.length}`);
  console.log('');

  if (longCandles.length > 0) {
    console.log('--- Candle-only ---');
    await runWithFeed('candle-long', () => {
      const feed = new BacktestFeed(longCandles);
      const execution = new SimulatedExecution(instrument, { type: 'realistic' });
      const runner = new AgentRunner({
        agent, feed, execution, instrument, capital: CAPITAL,
      });
      return { runner, feed };
    });

    console.log('--- Synthetic ticks ---');
    await runWithFeed('synthetic-long', () => {
      const execution = new SimulatedExecution(instrument, { type: 'realistic' });
      const runner = new AgentRunner({
        agent, feed: null!, execution, instrument, capital: CAPITAL,
      });
      const feed = new SyntheticTickFeed({
        candles: longCandles,
        instrument,
        onTick: (bid, ask, ts) => runner.processTick(bid, ask, ts),
      });
      (runner as any).feed = feed;
      return { runner, feed };
    });
  } else {
    console.log('No candle data for this period.\n');
  }

  await sql.close();
}

async function runWithFeed(
  label: string,
  setup: () => { runner: AgentRunner; feed: any },
): Promise<RunResult> {
  const { runner } = setup();
  const result = await runner.run();
  const metrics = MetricsEngine.calculate(result.fills, result.equityCurve, CAPITAL);

  printResult(label, result, metrics);
  return result;
}

function printResult(label: string, result: RunResult, metrics: Metrics) {
  console.log(`  Candles processed: ${result.totalCandles}`);
  console.log(`  Trades:           ${metrics.totalTrades}`);

  if (metrics.totalTrades === 0) {
    console.log('  (no trades — agent did not find entry signals)');
    console.log('');
    return;
  }

  console.log(`  Win rate:         ${(metrics.winRate * 100).toFixed(1)}%`);
  console.log(`  Total PnL:        $${metrics.totalPnL.toFixed(2)}`);
  console.log(`  Total return:     ${(metrics.totalReturn * 100).toFixed(2)}%`);
  console.log(`  Max drawdown:     ${(metrics.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  Final balance:    $${result.finalBalance.toFixed(2)}`);

  if (result.fills.length > 0) {
    console.log('  Fills:');
    for (const fill of result.fills) {
      const dir = fill.action === 'OPENED' ? '→' : '←';
      const pnl = fill.pnl !== undefined ? ` PnL=$${fill.pnl.toFixed(2)}` : '';
      console.log(`    ${dir} ${fill.action} ${fill.side} ${fill.size} @ ${fill.price} [${fill.reason}]${pnl}`);
    }
  }

  console.log('');
}

main().catch(err => {
  console.error('Compare failed:', err);
  process.exit(1);
});

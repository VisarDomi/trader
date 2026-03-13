import { test, expect, describe } from 'bun:test';
import { TickGenerator, type TickGeneratorConfig } from './TickGenerator.ts';
import type { InstrumentInfo } from '../agent/types.ts';

const US100: InstrumentInfo = {
  epic: 'US100',
  leveraged: true,
  leverage: 20,
  spread: 1.8,
  lotSize: 1,
  minSize: 0.5,
  maxSize: 50,
  sizeIncrement: 0.5,
  pricePrecision: 1,
  tradingHours: { timezone: 'America/New_York', gaps: [] },
};

const baseConfig: TickGeneratorConfig = {
  tickSigma: 0.2,
  meanReversion: 0.002,
  spreadMean: 1.8,
  spreadStd: 0,
  jumpProb: 0,
  jumpMultiplier: 5,
  ticksPerMinute: 600,
  pricePrecision: 1,
};

describe('TickGenerator', () => {
  test('generates the requested number of ticks', () => {
    const gen = new TickGenerator(baseConfig);
    const ticks = gen.generate(21000, 21001.8, 1000000, 100);
    expect(ticks).toHaveLength(100);
  });

  test('timestamps are evenly spaced', () => {
    const gen = new TickGenerator(baseConfig);
    const ticks = gen.generate(21000, 21001.8, 0, 10);

    const dtMs = 60_000 / 600; // 100ms
    for (let i = 0; i < ticks.length; i++) {
      expect(ticks[i].timestamp).toBe(Math.round(i * dtMs));
    }
  });

  test('prices are rounded to pricePrecision', () => {
    const gen = new TickGenerator(baseConfig);
    const ticks = gen.generate(21000, 21001.8, 0, 500);

    for (const tick of ticks) {
      // 1 decimal place: multiply by 10, should be integer
      expect(Math.round(tick.bid * 10)).toBe(tick.bid * 10);
      expect(Math.round(tick.ask * 10)).toBe(tick.ask * 10);
    }
  });

  test('ask is always greater than bid (with fixed spread)', () => {
    const gen = new TickGenerator(baseConfig);
    const ticks = gen.generate(21000, 21001.8, 0, 1000);

    for (const tick of ticks) {
      expect(tick.ask).toBeGreaterThan(tick.bid);
    }
  });

  test('spread stays close to configured mean (fixed spread)', () => {
    const gen = new TickGenerator(baseConfig);
    const ticks = gen.generate(21000, 21001.8, 0, 1000);

    for (const tick of ticks) {
      const spread = tick.ask - tick.bid;
      // With spreadStd=0 and pricePrecision=1, spread should be exactly 1.8
      expect(Math.abs(spread - 1.8)).toBeLessThan(0.15);
    }
  });

  test('generateForDuration produces correct count', () => {
    const gen = new TickGenerator(baseConfig);
    // 1 minute at 600 ticks/min = 600 ticks
    const ticks = gen.generateForDuration(21000, 21001.8, 0, 60_000);
    expect(ticks).toHaveLength(600);
  });

  test('generateForDuration: 300ms at 600/min ≈ 3 ticks', () => {
    const gen = new TickGenerator(baseConfig);
    const ticks = gen.generateForDuration(21000, 21001.8, 0, 300);
    expect(ticks).toHaveLength(3);
  });

  test('generateForDuration: always at least 1 tick', () => {
    const gen = new TickGenerator(baseConfig);
    const ticks = gen.generateForDuration(21000, 21001.8, 0, 1);
    expect(ticks.length).toBeGreaterThanOrEqual(1);
  });

  test('mid-price has reasonable volatility (no explosion)', () => {
    const gen = new TickGenerator(baseConfig);
    const ticks = gen.generate(21000, 21001.8, 0, 6000); // 10 minutes

    const startMid = (21000 + 21001.8) / 2;
    for (const tick of ticks) {
      const mid = (tick.bid + tick.ask) / 2;
      // After 6000 ticks with σ=0.2, max drift ~ 0.2 * sqrt(6000) ≈ 15.5
      // With 99.9% confidence: 3.3 * 15.5 ≈ 51. Use generous bound.
      expect(Math.abs(mid - startMid)).toBeLessThan(100);
    }
  });

  test('mean reversion pulls price back toward anchor', () => {
    // High mean reversion, no noise → price should stay near start
    const gen = new TickGenerator({
      ...baseConfig,
      tickSigma: 0,       // no noise
      meanReversion: 0.5,  // strong pull
    });

    const ticks = gen.generate(21000, 21001.8, 0, 100);
    const startMid = (21000 + 21001.8) / 2;

    for (const tick of ticks) {
      const mid = (tick.bid + tick.ask) / 2;
      expect(Math.abs(mid - startMid)).toBeLessThan(1);
    }
  });

  test('jumps produce occasional large moves', () => {
    const gen = new TickGenerator({
      ...baseConfig,
      tickSigma: 0.2,
      jumpProb: 0.1,       // 10% chance per tick
      jumpMultiplier: 10,
    });

    const ticks = gen.generate(21000, 21001.8, 0, 1000);

    // With jumps, we should see at least one move > 3σ = 0.6
    let largeMove = false;
    for (let i = 1; i < ticks.length; i++) {
      const prevMid = (ticks[i - 1].bid + ticks[i - 1].ask) / 2;
      const mid = (ticks[i].bid + ticks[i].ask) / 2;
      if (Math.abs(mid - prevMid) > 0.6) {
        largeMove = true;
        break;
      }
    }
    expect(largeMove).toBe(true);
  });

  test('spread noise produces varying spreads', () => {
    const gen = new TickGenerator({
      ...baseConfig,
      spreadStd: 0.3,
    });

    const ticks = gen.generate(21000, 21001.8, 0, 500);
    const spreads = ticks.map(t => t.ask - t.bid);
    const uniqueSpreads = new Set(spreads.map(s => s.toFixed(1)));

    // Should have more than 1 unique spread value
    expect(uniqueSpreads.size).toBeGreaterThan(1);

    // All spreads should be positive
    for (const s of spreads) {
      expect(s).toBeGreaterThan(0);
    }
  });

  describe('fromInstrument', () => {
    test('creates generator with instrument defaults', () => {
      const gen = TickGenerator.fromInstrument(US100);
      const ticks = gen.generate(21000, 21001.8, 0, 600);

      expect(ticks).toHaveLength(600);
      // Spread should be around 1.8
      const avgSpread = ticks.reduce((s, t) => s + (t.ask - t.bid), 0) / ticks.length;
      expect(Math.abs(avgSpread - 1.8)).toBeLessThan(0.2);
    });

    test('respects overrides', () => {
      const gen = TickGenerator.fromInstrument(US100, { ticksPerMinute: 100 });
      const ticks = gen.generateForDuration(21000, 21001.8, 0, 60_000);
      expect(ticks).toHaveLength(100);
    });
  });

  test('tickIntervalMs is correct', () => {
    const gen = new TickGenerator(baseConfig);
    expect(gen.tickIntervalMs).toBe(100); // 60000 / 600
  });
});

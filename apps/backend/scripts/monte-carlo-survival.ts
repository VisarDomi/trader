/**
 * Monte Carlo survival simulation.
 *
 * Compares two position-sizing strategies under 200× leverage:
 *   A) Full-margin: all capital as margin each trade
 *   B) 2%-risk: risks 2% of equity per trade (Donchian agent sizing)
 *
 * Uses observed outcome distributions from the 1h/200× backtest.
 * Runs N_SIMS iterations of N_TRADES trades each.
 *
 * Usage: bun run src/run/monte-carlo-survival.ts
 */

const CAPITAL = 10_000;
const LEVERAGE = 200;
const PRICE = 20_000;       // approximate US100 price
const LOT_SIZE = 1;
const MIN_SIZE = 0.001;
const MIN_MARGIN = (MIN_SIZE * PRICE * LOT_SIZE) / LEVERAGE; // $0.10
const SPREAD = 1.8;

// ATR-based params (1h, ATR≈50, ATR×2 SL, RR×3 TP)
const SL_DISTANCE = 100;    // points
const TP_DISTANCE = 300;    // points

const N_SIMS = 10_000;
const N_TRADES = 5_000;     // trades per simulation

// Outcome probabilities observed from ch100/ATR2/RR3/200×/1h backtest:
//   Liquidations: 1031/1373 = 75.1%
//   TP hits:       109/1373 =  7.9%
//   SL hits:        12/1373 =  0.9%
//   Market close:  221/1373 = 16.1%
// We'll simplify to: liquidation, TP, SL, market_close
// Market close PnL varies — approximate as small random around 0.

interface SimResult {
  finalEquity: number;
  tradesBeforeBust: number | null; // null = survived all trades
  maxEquity: number;
  minEquity: number;
}

function simulate(mode: 'full_margin' | 'risk_2pct'): SimResult {
  let equity = CAPITAL;
  let maxEquity = equity;
  let minEquity = equity;

  for (let i = 0; i < N_TRADES; i++) {
    if (equity < MIN_MARGIN) {
      return { finalEquity: equity, tradesBeforeBust: i, maxEquity, minEquity };
    }

    // Determine position size
    let size: number;
    if (mode === 'full_margin') {
      // All available equity as margin → maximum position
      size = (equity * LEVERAGE) / (PRICE * LOT_SIZE);
    } else {
      // Risk 2% of equity based on SL distance
      size = (equity * 0.02) / (SL_DISTANCE * LOT_SIZE);
    }
    size = Math.max(MIN_SIZE, size);

    const margin = (size * PRICE * LOT_SIZE) / LEVERAGE;
    if (margin > equity) {
      // Can't afford this position
      size = (equity * LEVERAGE) / (PRICE * LOT_SIZE);
    }

    // Spread cost on entry (BUY at ask, value at bid)
    const spreadCost = SPREAD * size * LOT_SIZE;

    // Liquidation price: entry × (1 - 0.5/leverage) for BUY
    // Loss at liquidation = 0.5 × margin
    const liqLoss = 0.5 * margin + spreadCost;

    // Random outcome
    const roll = Math.random();

    let pnl: number;
    if (roll < 0.751) {
      // Liquidation (75.1%)
      pnl = -liqLoss;
    } else if (roll < 0.751 + 0.079) {
      // TP hit (7.9%) — profit = TP distance × size × lotSize - spread
      pnl = TP_DISTANCE * size * LOT_SIZE - spreadCost;
    } else if (roll < 0.751 + 0.079 + 0.009) {
      // SL hit (0.9%) — loss = SL distance × size × lotSize + spread
      pnl = -(SL_DISTANCE * size * LOT_SIZE + spreadCost);
    } else {
      // Market close (16.1%) — small random PnL around 0
      const movePoints = (Math.random() - 0.5) * SL_DISTANCE * 0.5;
      pnl = movePoints * size * LOT_SIZE - spreadCost;
    }

    equity += pnl;
    if (equity < 0) equity = 0;
    if (equity > maxEquity) maxEquity = equity;
    if (equity < minEquity) minEquity = equity;
  }

  return { finalEquity: equity, tradesBeforeBust: null, maxEquity, minEquity };
}

function runSims(mode: 'full_margin' | 'risk_2pct'): void {
  const label = mode === 'full_margin' ? 'Full-Margin Agent' : '2%-Risk Agent';
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label} (${N_SIMS.toLocaleString()} simulations × ${N_TRADES.toLocaleString()} trades)`);
  console.log(`${'='.repeat(60)}`);

  const results: SimResult[] = [];
  for (let i = 0; i < N_SIMS; i++) {
    results.push(simulate(mode));
  }

  const busted = results.filter(r => r.tradesBeforeBust !== null);
  const survived = results.filter(r => r.tradesBeforeBust === null);
  const bustTrades = busted.map(r => r.tradesBeforeBust!).sort((a, b) => a - b);

  console.log(`\nSurvival:`);
  console.log(`  Busted: ${busted.length}/${N_SIMS} (${(busted.length / N_SIMS * 100).toFixed(1)}%)`);
  console.log(`  Survived all ${N_TRADES} trades: ${survived.length}/${N_SIMS} (${(survived.length / N_SIMS * 100).toFixed(1)}%)`);

  if (busted.length > 0) {
    const median = bustTrades[Math.floor(bustTrades.length / 2)]!;
    const p5 = bustTrades[Math.floor(bustTrades.length * 0.05)]!;
    const p95 = bustTrades[Math.floor(bustTrades.length * 0.95)]!;
    const mean = bustTrades.reduce((a, b) => a + b, 0) / bustTrades.length;

    console.log(`\nTrades before bust (among busted):`);
    console.log(`  Mean:   ${mean.toFixed(0)}`);
    console.log(`  Median: ${median}`);
    console.log(`  P5:     ${p5}`);
    console.log(`  P95:    ${p95}`);
    console.log(`  Min:    ${bustTrades[0]}`);
    console.log(`  Max:    ${bustTrades[bustTrades.length - 1]}`);
  }

  const finals = results.map(r => r.finalEquity).sort((a, b) => a - b);
  const medianFinal = finals[Math.floor(finals.length / 2)]!;
  const meanFinal = finals.reduce((a, b) => a + b, 0) / finals.length;
  const p5Final = finals[Math.floor(finals.length * 0.05)]!;
  const p95Final = finals[Math.floor(finals.length * 0.95)]!;

  console.log(`\nFinal equity distribution:`);
  console.log(`  Mean:   $${meanFinal.toFixed(0)}`);
  console.log(`  Median: $${medianFinal.toFixed(0)}`);
  console.log(`  P5:     $${p5Final.toFixed(0)}`);
  console.log(`  P95:    $${p95Final.toFixed(0)}`);
  console.log(`  Min:    $${finals[0]!.toFixed(0)}`);
  console.log(`  Max:    $${finals[finals.length - 1]!.toFixed(0)}`);

  if (survived.length > 0) {
    const maxEquities = survived.map(r => r.maxEquity).sort((a, b) => a - b);
    const medianMax = maxEquities[Math.floor(maxEquities.length / 2)]!;
    console.log(`\nPeak equity (among survivors):`);
    console.log(`  Median peak: $${medianMax.toFixed(0)}`);
    console.log(`  Max peak:    $${maxEquities[maxEquities.length - 1]!.toFixed(0)}`);
  }
}

console.log(`Monte Carlo Survival Simulation`);
console.log(`Capital: $${CAPITAL.toLocaleString()}, Leverage: ${LEVERAGE}×, Price: ${PRICE}`);
console.log(`SL: ${SL_DISTANCE}pts, TP: ${TP_DISTANCE}pts (RR 3:1)`);
console.log(`Outcome distribution: 75.1% liquidation, 7.9% TP, 0.9% SL, 16.1% market close`);

runSims('full_margin');
runSims('risk_2pct');

/**
 * Trend Follower blueprint.
 *
 * Generates agents across two dimension sweeps × leverage:
 *   1. trendPct sweep (4 TFs × 8–9 thresholds, default TP)
 *   2. TP sweep (4 TFs × 9 TP values, fixed trendPct=1.5%)
 *   × 2 leverage values = 142 agents
 *
 * Factory logic lives in factory.ts (also used by batch runners).
 */
import type { AgentBlueprint, Dimension } from '../../src/core/agent/types.ts';
import { createAgent } from './factory.ts';

// --- Dimension generation ---

type TrendDim = Dimension & {
  timeframe: string;
  trendPct: number;
  leverage: number;
  tpReturn?: number;
};

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h'] as const;
const LEVERAGES = [20, 200] as const;

// trendPct values per timeframe (1m stops at 2.00%, others go to 3.00%)
const TREND_PCTS: Record<string, number[]> = {
  '1m': [0.0025, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.0175, 0.02],
  '5m': [0.0025, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.0175, 0.02, 0.03],
  '15m': [0.0025, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.0175, 0.02, 0.03],
  '1h': [0.0025, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.0175, 0.02, 0.03],
  '4h': [0.0025, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.0175, 0.02, 0.03],
};

// TP-sweep: fixed trendPct, varying tpReturn
const TP_SWEEP_TREND_PCT = 0.015;
const TP_RETURNS = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50];
const TP_LABELS = ['025', '050', '075', '100', '125', '150', '175', '200', '250'];

function pctLabel(pct: number): string {
  // 0.0025 → "025" (0.25%), 0.005 → "050" (0.50%), 0.03 → "300" (3.00%)
  return String(Math.round(pct * 10000)).padStart(3, '0');
}

const dimensions: TrendDim[] = [];

// Standard trendPct sweep (default TP = +100% margin)
for (const lev of LEVERAGES) {
  for (const tf of TIMEFRAMES) {
    for (const trendPct of TREND_PCTS[tf]!) {
      dimensions.push({
        id: `${tf}-${pctLabel(trendPct)}-lev${lev}`,
        timeframe: tf,
        trendPct,
        leverage: lev,
      });
    }
  }
}

// TP sweep (fixed trendPct, varying TP)
for (const lev of LEVERAGES) {
  for (const tf of TIMEFRAMES) {
    for (let i = 0; i < TP_RETURNS.length; i++) {
      dimensions.push({
        id: `tp-sweep/${tf}-tp${TP_LABELS[i]}-lev${lev}`,
        timeframe: tf,
        trendPct: TP_SWEEP_TREND_PCT,
        tpReturn: TP_RETURNS[i],
        leverage: lev,
      });
    }
  }
}

// --- Blueprint export ---

export default {
  name: 'Trend Follower',
  version: '1.0.0',
  instrument: 'US100',
  dimensions,
  createAgent(dim: TrendDim) {
    const pctStr = (dim.trendPct * 100).toFixed(2);
    let name = `Trend ${dim.timeframe} ${pctStr}% lev${dim.leverage}`;
    if (dim.tpReturn != null) {
      const tpStr = (dim.tpReturn * 100).toFixed(2);
      name = `Trend ${dim.timeframe} t${pctStr}% tp${tpStr}% lev${dim.leverage}`;
    }
    return createAgent({
      name,
      timeframe: dim.timeframe as any,
      trendPct: dim.trendPct,
      leverage: dim.leverage,
      tpReturn: dim.tpReturn,
    });
  },
} satisfies AgentBlueprint<any>;

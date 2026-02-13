/**
 * MACD + EMA Trend Filter blueprint.
 *
 * Dimensions: timeframe × emaPeriod × tpReturn
 * = 2 TF × 3 EMA × 5 TP = 30 agents
 *
 * Factory logic lives in factory.ts (also used by batch runners).
 */
import type { AgentBlueprint, Dimension } from '../../src/core/agent/types.ts';
import { createMacdEmaAgent } from './factory.ts';

type MacdDim = Dimension & {
  timeframe: string;
  emaPeriod: number;
  tpReturn: number;
};

const TIMEFRAMES = ['1m', '5m'] as const;
const EMA_PERIODS = [50, 100, 200];
const TP_RETURNS = [0.10, 0.20, 0.30, 0.40, 0.50];

const dimensions: MacdDim[] = [];

for (const tf of TIMEFRAMES) {
  for (const ema of EMA_PERIODS) {
    for (const tp of TP_RETURNS) {
      const tpLabel = (tp * 100).toFixed(0);
      dimensions.push({
        id: `${tf}-ema${ema}-tp${tpLabel}`,
        timeframe: tf,
        emaPeriod: ema,
        tpReturn: tp,
      });
    }
  }
}

export default {
  name: 'MACD + EMA',
  version: '1.0.0',
  instrument: 'US100',
  dimensions,
  createAgent(dim: MacdDim) {
    return createMacdEmaAgent({
      name: `MACD-EMA${dim.emaPeriod} ${dim.timeframe} tp${(dim.tpReturn * 100).toFixed(0)}%`,
      timeframe: dim.timeframe as any,
      emaPeriod: dim.emaPeriod,
      tpReturn: dim.tpReturn,
    });
  },
} satisfies AgentBlueprint<any>;

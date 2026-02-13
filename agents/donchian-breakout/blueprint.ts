/**
 * Donchian Channel Breakout blueprint.
 *
 * Dimensions: timeframe × channelLength × atrMultiple × rewardRatio
 * = 2 TF × 3 channel × 3 ATR × 3 RR = 54 agents
 *
 * Factory logic lives in factory.ts (also used by batch runners).
 */
import type { AgentBlueprint, Dimension } from '../../src/core/agent/types.ts';
import { createDonchian } from './factory.ts';

type DonchianDim = Dimension & {
  timeframe: string;
  channelLength: number;
  atrMultiple: number;
  rewardRatio: number;
};

const TIMEFRAMES = ['1m', '5m'] as const;
const CHANNEL_LENGTHS = [20, 50, 100];
const ATR_MULTIPLES = [1.0, 2.0, 3.0];
const REWARD_RATIOS = [1.5, 2.0, 3.0];

const dimensions: DonchianDim[] = [];

for (const tf of TIMEFRAMES) {
  for (const ch of CHANNEL_LENGTHS) {
    for (const atr of ATR_MULTIPLES) {
      for (const rr of REWARD_RATIOS) {
        dimensions.push({
          id: `${tf}-ch${ch}-atr${atr}-rr${rr}`,
          timeframe: tf,
          channelLength: ch,
          atrMultiple: atr,
          rewardRatio: rr,
        });
      }
    }
  }
}

export default {
  name: 'Donchian Breakout',
  version: '1.0.0',
  instrument: 'US100',
  dimensions,
  createAgent(dim: DonchianDim) {
    return createDonchian({
      name: `Donchian ${dim.timeframe} ch${dim.channelLength} atr${dim.atrMultiple} rr${dim.rewardRatio}`,
      timeframe: dim.timeframe as any,
      channelLength: dim.channelLength,
      atrMultiple: dim.atrMultiple,
      rewardRatio: dim.rewardRatio,
    });
  },
} satisfies AgentBlueprint<any>;

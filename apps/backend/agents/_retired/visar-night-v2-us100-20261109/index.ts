import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Selected from inspected history at the user's request; fresh forward records test the selection.
export default defineAgent({
  ...reference,
  name: 'Visar US100 night v2',
  description: 'US100 night experiments: full/central NY recognition, minimum opposite-side bid gap, leverage, loss and capital-profit limits. Frozen 03:27/08:27 Tirana clocks; ten higher-frequency roles across the cohort. User-requested Capital demo research.',
  instruments: ['US100'],
  author: 'Visar / platform research',
  leverage: [20],
  variants: {
  "frequent-core": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 20,
    "profitPct": 20
  },
  "frequent-gap": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 5,
    "lossPct": 20,
    "profitPct": 100
  },
  "frequent-reversal": {
    "maxRetraceShare": 0.5,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 20,
    "profitPct": 50
  },
  "frequent-small": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 20,
    "profitPct": 0
  },
  "frequent-gap-small": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 5,
    "lossPct": 20,
    "profitPct": 0
  },
  "central-reversal": {
    "maxRetraceShare": 0.35,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 10,
    "profitPct": 100
  },
  "large-gap": {
    "minDirectionalShare": 0.6153846153846154,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 15,
    "lossPct": 10,
    "profitPct": 20
  },
  "largest-gap": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 30,
    "lossPct": 5,
    "profitPct": 50
  },
  "full-steps": {
    "minDirectionalShare": 0.6153846153846154,
    "sessionStart": 570,
    "sessionEnd": 960,
    "minPullbackBp": 5,
    "lossPct": 20,
    "profitPct": 0
  },
  "central-body": {
    "minBodyShare": 0.8,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 20,
    "profitPct": 20
  }
},
});

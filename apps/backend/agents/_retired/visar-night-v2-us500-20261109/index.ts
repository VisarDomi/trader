import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Selected from inspected history at the user's request; fresh forward records test the selection.
export default defineAgent({
  ...reference,
  name: 'Visar US500 night v2',
  description: 'US500 night experiments: full/central NY recognition, minimum opposite-side bid gap, leverage, loss and capital-profit limits. Frozen 03:27/08:27 Tirana clocks; ten higher-frequency roles across the cohort. User-requested Capital demo research.',
  instruments: ['US500'],
  author: 'Visar / platform research',
  leverage: [20],
  variants: {
  "frequent-core": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 10,
    "profitPct": 0
  },
  "frequent-gap": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 5,
    "lossPct": 20,
    "profitPct": 20
  },
  "frequent-reversal": {
    "maxRetraceShare": 0.5,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 5,
    "profitPct": 0
  },
  "frequent-reversal-gap": {
    "maxRetraceShare": 0.5,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 5,
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
  "full-steps": {
    "minDirectionalShare": 0.6153846153846154,
    "sessionStart": 570,
    "sessionEnd": 960,
    "minPullbackBp": 5,
    "lossPct": 30,
    "profitPct": 20
  },
  "full-reversal": {
    "maxRetraceShare": 0.35,
    "sessionStart": 570,
    "sessionEnd": 960,
    "minPullbackBp": 0,
    "lossPct": 10,
    "profitPct": 0
  },
  "central-body": {
    "minBodyShare": 0.8,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 5,
    "lossPct": 20,
    "profitPct": 100
  },
  "central-steps": {
    "minDirectionalShare": 0.6153846153846154,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 5,
    "lossPct": 20,
    "profitPct": 0
  }
},
});

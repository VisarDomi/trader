import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Selected from inspected history at the user's request; fresh forward records test the selection.
export default defineAgent({
  ...reference,
  name: 'Visar US100 night v2',
  description: 'US100 night experiments: full/central NY recognition, minimum opposite-side bid gap, leverage and loss limits. Frozen 03:27/08:27 Tirana clocks; ten higher-frequency roles across the cohort. User-requested Capital demo research.',
  instruments: ['US100'],
  author: 'Visar / platform research',
  leverage: [20],
  variants: {
  "frequent-core": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 20
  },
  "frequent-gap": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 5,
    "lossPct": 20
  },
  "frequent-reversal": {
    "maxRetraceShare": 0.5,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 20
  },
  "frequent-small": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 20
  },
  "frequent-gap-small": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 5,
    "lossPct": 20
  },
  "central-reversal": {
    "maxRetraceShare": 0.35,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 10
  },
  "large-gap": {
    "minDirectionalShare": 0.6153846153846154,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 15,
    "lossPct": 5
  },
  "largest-gap": {
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 30,
    "lossPct": 20
  },
  "full-steps": {
    "minDirectionalShare": 0.6153846153846154,
    "sessionStart": 570,
    "sessionEnd": 960,
    "minPullbackBp": 5,
    "lossPct": 20
  },
  "central-body": {
    "minBodyShare": 0.8,
    "sessionStart": 630,
    "sessionEnd": 930,
    "minPullbackBp": 0,
    "lossPct": 20
  }
},
});

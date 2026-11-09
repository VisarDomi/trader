import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Direction controls for visar-night-v3-us100/base: identical nights, settings and exits.
// If the previous-day direction rule adds nothing, these should do as well as base.
export default defineAgent({
  ...reference,
  name: 'Visar US100 night v3 control',
  description: 'Control for US100 base: trades exactly its eligible nights (10:30–15:30 NY day, any overnight counter-move, 1:20, 50% loss limit, 08:27 exit), but always long or in a random direction instead of following the previous day.',
  instruments: ['US100'],
  author: 'Visar / platform research',
  leverage: [20],
  variants: {
    'always-long': {"direction": "long", "sessionStart": 630, "sessionEnd": 930, "minPullbackBp": 0, "lossPct": 50, "profitPct": 0},
    'random-direction': {"direction": "random", "sessionStart": 630, "sessionEnd": 930, "minPullbackBp": 0, "lossPct": 50, "profitPct": 0},
  },
});

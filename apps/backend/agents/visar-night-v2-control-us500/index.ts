import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Direction controls for visar-night-v2-us500/frequent-core: identical nights, settings and exits.
// If the previous-day direction rule adds nothing, these should do as well as frequent-core.
export default defineAgent({
  ...reference,
  name: 'Visar US500 night v2 control',
  description: 'Control for US500 frequent-core: trades exactly its eligible nights (10:30–15:30 NY day, any overnight counter-move, 1:20, −10% loss, 08:27 exit), but always long or in a random direction instead of following the previous day.',
  instruments: ['US500'],
  author: 'Visar / platform research',
  leverage: [20],
  variants: {
    'always-long': { direction: 'long', sessionStart: 630, sessionEnd: 930, minPullbackBp: 0, lossPct: 10, profitPct: 0 },
    'random-direction': { direction: 'random', sessionStart: 630, sessionEnd: 930, minPullbackBp: 0, lossPct: 10, profitPct: 0 },
  },
});

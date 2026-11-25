import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Direction controls for Visar Night: trade the exact qualifying nights of `visar-night/midday-20`
// on US500 and US100 at 1:20, replacing only the trade direction (always long or fair coin flip).
const midday = { sessionStart: 630, sessionEnd: 930, minPullbackBp: 0, pullback: 1, lossPct: 50, profitPct: 0 };

export default defineAgent({
  ...reference,
  name: 'Visar Night Control',
  description: 'Direction controls for Visar Night on US500 & US100: identical midday-20 qualifying nights and 1:20 risk, choosing always-long or fair coin-flip side.',
  author: 'Visar / platform research',
  instruments: ['US500', 'US100'],
  leverage: [20],
  variants: {
    'always-long': { ...midday, direction: 'long' },
    'random-direction': { ...midday, direction: 'random' },
  },
});

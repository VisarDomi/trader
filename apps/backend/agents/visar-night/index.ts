import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Unified Visar Night family across US500 and US100 (New York clocks: 16:00 ref, 21:27 entry, 02:27 exit).
// Every variant trades symmetrically on both US500 and US100 with a 50% capital stop and FOMC/BOJ calendar guard.
const midday = { sessionStart: 630, sessionEnd: 930, minPullbackBp: 0, pullback: 1, lossPct: 50, profitPct: 0 };
const fullDay = { sessionStart: 570, sessionEnd: 960, minPullbackBp: 0, pullback: 1, lossPct: 50, profitPct: 0 };
const anyDay = { trendPct: 0, minEfficiency: 0, minDirectionalShare: 0, maxRetraceShare: 1, maxRangePct: 100, minBodyShare: 0 };

export default defineAgent({
  ...reference,
  name: 'Visar Night',
  description: 'Overnight US500 & US100 NY-session continuation family (16:00 NY ref, 21:27 NY entry, 02:27 NY exit, 50% capital stop). Variants compare full-day vs midday windows, 1:200 vs 1:20 leverage, pullback requirement, and day-filter strictness.',
  author: 'Visar',
  instruments: ['US500', 'US100'],
  leverage: [20],
  variants: {
    'full-day-200': { ...fullDay },
    'midday-200': { ...midday },
    'midday-20': { ...midday },
    'full-day-20': { ...fullDay },
    'no-pullback-20': { ...midday, pullback: 0 },
    'loose-body-20': { ...midday, minBodyShare: 0.3 },
    'any-day-20': { ...midday, ...anyDay },
    'every-night-20': { ...midday, ...anyDay, pullback: 0 },
  },
});

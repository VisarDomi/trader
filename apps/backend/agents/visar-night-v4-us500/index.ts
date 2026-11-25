import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Looser night cohort (2026-11-22, user request). The strict v3 variants could only trade on the base's nights;
// these trade more of them, at 1:20 where the 50% loss limit sits about 2.8% away and overnight noise does not reach it.
// Each is v3 base (10:30–15:30 NY day, standard day filter, any overnight counter-move, 1:20, 50% loss limit,
// 02:27 New York exit) plus one loosening, or two for every-night. full-day is the original's 09:30–16:00 window at 1:20.
const base = { sessionStart: 630, sessionEnd: 930, minPullbackBp: 0, lossPct: 50, profitPct: 0 };
const anyDay = { trendPct: 0, minEfficiency: 0, minDirectionalShare: 0, maxRetraceShare: 1, maxRangePct: 100, minBodyShare: 0 };
export default defineAgent({
  ...reference,
  name: 'Visar US500 night v4',
  description: 'US500 night directions looser than the base: weaker day shape (loose-body), no overnight pullback needed (no-pullback), any up or down day (any-day), every weeknight (every-night) and the full NY day (full-day). New York clocks: 16:00 close, entry 21:27, exit 02:27 (22:00, 03:27 and 08:27 in Tirana outside the clock-change weeks), 1:20. User-requested Capital demo research.',
  instruments: ['US500'],
  author: 'Visar / platform research',
  leverage: [20],
  variants: {
    'loose-body': { ...base, minBodyShare: 0.3 },
    'no-pullback': { ...base, pullback: 0 },
    'any-day': { ...base, ...anyDay },
    'every-night': { ...base, ...anyDay, pullback: 0 },
    'full-day': { ...base, sessionStart: 570, sessionEnd: 960 },
  },
});

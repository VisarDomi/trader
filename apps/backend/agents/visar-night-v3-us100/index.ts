import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Uniform night cohort (2026-11-09): every variant is the base plus one change, so each one explores a
// single dimension. base = 10:30–15:30 NY day, standard day filter, any overnight counter-move, 1:20,
// 50% loss limit (it never triggers at 1:20; it does at 1:200), exit 08:27, no profit target.
// Controls (always long, random direction) are in visar-night-v3-control-us100. full-day-200 repeats
// the original agent's settings (US500, visar-night-trading) on US100.
export default defineAgent({
  ...reference,
  name: 'Visar US100 night v3',
  description: 'US100 night directions around one base: day size (big-move), day shape (strong-day, steady-day), overnight gap (gap-5bp, gap-15bp) and leverage (leverage-200, full-day-200). Frozen 03:27/08:27 Tirana clocks. User-requested Capital demo research.',
  instruments: ['US100'],
  author: 'Visar / platform research',
  leverage: [20],
  variants: {
    "base": {
      "sessionStart": 630,
      "sessionEnd": 930,
      "minPullbackBp": 0,
      "lossPct": 50,
      "profitPct": 0
    },
    "big-move": {
      "sessionStart": 630,
      "sessionEnd": 930,
      "minPullbackBp": 0,
      "lossPct": 50,
      "profitPct": 0,
      "trendPct": 0.5
    },
    "strong-day": {
      "sessionStart": 630,
      "sessionEnd": 930,
      "minPullbackBp": 0,
      "lossPct": 50,
      "profitPct": 0,
      "minBodyShare": 0.8
    },
    "steady-day": {
      "sessionStart": 630,
      "sessionEnd": 930,
      "minPullbackBp": 0,
      "lossPct": 50,
      "profitPct": 0,
      "minDirectionalShare": 0.6153846153846154
    },
    "gap-5bp": {
      "sessionStart": 630,
      "sessionEnd": 930,
      "minPullbackBp": 5,
      "lossPct": 50,
      "profitPct": 0
    },
    "gap-15bp": {
      "sessionStart": 630,
      "sessionEnd": 930,
      "minPullbackBp": 15,
      "lossPct": 50,
      "profitPct": 0
    },
    "leverage-200": {
      "sessionStart": 630,
      "sessionEnd": 930,
      "minPullbackBp": 0,
      "lossPct": 50,
      "profitPct": 0
    },
    "full-day-200": {
      "sessionStart": 570,
      "sessionEnd": 960,
      "minPullbackBp": 0,
      "lossPct": 50,
      "profitPct": 0
    }
  },
});

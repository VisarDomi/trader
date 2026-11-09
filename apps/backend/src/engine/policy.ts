// Shared policy source. Dashboard re-exports this module; deploys include src/engine.
export const CONTROL_SLUGS: ReadonlySet<string> = new Set([
  'random-baseline',
  'buy-hold',
  'leverage-ladder',
  'constant-leverage',
  'bold-play',
  'martingale-monkey',
  'skew-monkey',
  // Direction controls for the Visar night cohort: same nights as frequent-core, always long or a coin flip.
  'visar-night-v2-control-us100',
  'visar-night-v2-control-us500',
]);
/** Random-entry agents whose results show what luck looks like. */
export const RANDOM_BASELINE_SLUG = 'random-baseline';

export const LIFECYCLE = {
  /** A run is judged after this many closed trades and days live... */
  MIN_TRADES: 30,
  MIN_DAYS: 28,
  /** ...or, for slow agents, after this many days with at least SLOW_MIN_TRADES trades. */
  SLOW_MIN_DAYS: 90,
  SLOW_MIN_TRADES: 10,
  /** A run that has not traded at all for this long is retired. */
  SILENT_DAYS: 60,
  /** Judged runs with a trade t-statistic at or below this are retired: with no edge the spread drags t below zero. */
  RETIRE_TSTAT: -1,
  /** Judged runs at or above this, and above every random monkey's t on the same instrument, lead. */
  LEADER_TSTAT: 2,
  /** An agent is retired as a whole when at least this share of its judged runs (and at least 3) are retired. */
  AGENT_RETIRE_SHARE: 2 / 3,
  AGENT_RETIRE_MIN_JUDGED: 3,
  /** Live demo runs the arena should hold at most (memory on the shared server); new agents wait above it. */
  PAPER_RUN_SOFT_CAP: 5000,
  /** Days between new-agent additions. */
  ADD_AGENTS_EVERY_DAYS: 7,
} as const;

const SPARSE_NIGHT_IDS:ReadonlySet<string>=new Set(['visar-night-lab/body-5x','visar-night-lab/body-20x','visar-night-lab/body-tight-100x','visar-night-lab/retrace-100x','visar-night-us100/body-5x']);

const V2_SPARSE_NIGHT_IDS:ReadonlySet<string>=new Set(["visar-night-v2-us100/central-reversal", "visar-night-v2-us500/full-reversal", "visar-night-v2-us100/large-gap", "visar-night-v2-us500/central-body", "visar-night-v2-us100/largest-gap", "visar-night-v2-us500/central-steps", "visar-night-v2-us100/full-steps", "visar-night-v2-us100/central-body"]);

// Frozen sparse experiments must be allowed to reach their declared entry cadence.
// Error/ruin and mature losing-evidence rules still apply immediately as before.
export function silentDaysFor(agentId:string):number {
  if(agentId==='visar-night-lab/clean-50x')return 365;
  if(SPARSE_NIGHT_IDS.has(agentId)||V2_SPARSE_NIGHT_IDS.has(agentId))return 180;
  return LIFECYCLE.SILENT_DAYS;
}

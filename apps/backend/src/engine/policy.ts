// Shared policy source. Dashboard re-exports this module; deploys include src/engine.
export const CONTROL_SLUGS: ReadonlySet<string> = new Set([
  'random-baseline',
  'buy-hold',
  'leverage-ladder',
  'constant-leverage',
  'bold-play',
  'martingale-monkey',
  'skew-monkey',
  // Direction controls for the Visar Night family: same nights as midday-20, always long or a coin flip.
  'visar-night-control',
  'visar-night-v2-control-us100',
  'visar-night-v2-control-us500',
  'visar-night-v3-control-us100',
  'visar-night-v3-control-us500',
]);
/** Random-entry agents whose results show what luck looks like. */
export const RANDOM_BASELINE_SLUG = 'random-baseline';

export const LIFECYCLE = {
  /**
   * The floor under which a record says nothing either way: closed trades and days observed (42 days are 30
   * weekdays of the daily clock, the fewest its statistics are meant for).
   */
  MIN_TRADES: 10,
  MIN_DAYS: 42,
  /** Losing evidence acts from this many closed trades... */
  LOSER_MIN_TRADES: 30,
  /** ...or, for slow agents, after this many days with at least SLOW_MIN_TRADES trades. */
  SLOW_MIN_DAYS: 90,
  SLOW_MIN_TRADES: 10,
  /** A run that has not traded at all for this long is retired. */
  SILENT_DAYS: 60,
  /** Runs with enough losing evidence and a daily t-statistic at or below this are retired: with no edge the spread drags t below zero. */
  RETIRE_TSTAT: -1,
  /** Records past the floor at or above this, and above every random monkey's t on the same instrument, are candidates: they may compete for Capital demo slots. */
  CANDIDATE_TSTAT: 2,
  /** Confirmed records: the expected share of them that is luck, counted over every strategy record ever started. */
  CONFIRM_FDR: 0.1,
  /** The chance a record with no edge ever clears the bar for one record on its own. */
  ALONE_ALPHA: 0.025,
  /** Weight of the e-value's prior in days: its bar is lowest for records about a year long. */
  EVALUE_PRIOR_DAYS: 31,
  /** A forward mean daily return more than this many standard errors above its backtest's does not agree with it. */
  AGREE_Z: 2,
  /** A run demoted from Capital demo waits this long before it can return or be archived. */
  REENTRY_DAYS: 28,
  /** An agent is retired as a whole when at least this share of its judged runs (and at least 3) are retired. */
  AGENT_RETIRE_SHARE: 2 / 3,
  AGENT_RETIRE_MIN_JUDGED: 3,
  /** Live demo runs the arena should hold at most (its measured capacity); new agents wait above it. */
  PAPER_RUN_SOFT_CAP: 5000,
  /** Days between new-agent additions. */
  ADD_AGENTS_EVERY_DAYS: 7,
} as const;

const SPARSE_NIGHT_IDS:ReadonlySet<string>=new Set(['visar-night-lab/body-5x','visar-night-lab/body-20x','visar-night-lab/body-tight-100x','visar-night-lab/retrace-100x','visar-night-us100/body-5x']);

const V2_SPARSE_NIGHT_IDS:ReadonlySet<string>=new Set(["visar-night-v2-us100/central-reversal", "visar-night-v2-us500/full-reversal", "visar-night-v2-us100/large-gap", "visar-night-v2-us500/central-body", "visar-night-v2-us100/largest-gap", "visar-night-v2-us500/central-steps", "visar-night-v2-us100/full-steps", "visar-night-v2-us100/central-body"]);

// v3 directions with about one entry a month (stricter day filters, larger gap).
const V3_SPARSE_NIGHT_IDS:ReadonlySet<string>=new Set(['us500','us100'].flatMap(i=>['big-move','strong-day','steady-day','gap-15bp'].map(v=>`visar-night-v3-${i}/${v}`)));

// Frozen sparse experiments must be allowed to reach their declared entry cadence.
// Error/ruin and mature losing-evidence rules still apply immediately.
export function silentDaysFor(agentId:string):number {
  if(agentId==='visar-night-lab/clean-50x')return 365;
  if(SPARSE_NIGHT_IDS.has(agentId)||V2_SPARSE_NIGHT_IDS.has(agentId)||V3_SPARSE_NIGHT_IDS.has(agentId))return 180;
  return LIFECYCLE.SILENT_DAYS;
}

/** Enough of a record to be judged at all (the floor of the daily clock). */
export function floorMet(trades: number, days: number): boolean {
  return trades >= LIFECYCLE.MIN_TRADES && days >= LIFECYCLE.MIN_DAYS;
}
/** Enough of a record for losing evidence to retire or demote it. */
export function loserMature(trades: number, days: number): boolean {
  return (trades >= LIFECYCLE.LOSER_MIN_TRADES && days >= LIFECYCLE.MIN_DAYS) || (trades >= LIFECYCLE.SLOW_MIN_TRADES && days >= LIFECYCLE.SLOW_MIN_DAYS);
}
/** A candidate for Capital demo slots: past the floor, daily t at the bar and above the instrument's luckiest monkey. */
export function isCandidate(trades: number, days: number, t: number, monkeyT: number | null): boolean {
  return floorMet(trades, days) && t >= LIFECYCLE.CANDIDATE_TSTAT && (monkeyT === null || t > monkeyT);
}

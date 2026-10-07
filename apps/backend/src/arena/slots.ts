/**
 * Which demo run is mirrored on which broker account.
 *
 * An account holds at most `slots` runs. An account in netting mode (hedging
 * off) also holds at most one run per instrument, because a second position on
 * the same instrument would net against the first. Assignments are sticky: a
 * run keeps its account until it stops, is excluded, or the account goes away.
 * Free slots are filled in candidate order (best first), spreading runs over
 * the accounts with the most free slots. When every slot is taken, a waiting
 * run whose score beats the weakest mirrored run by a margin takes its slot
 * (promotion/demotion), but only while the weaker run can give it up.
 */

export interface SlotAccount {
  name: string;
  slots: number;
  /** Netting mode: one run per instrument. */
  onePerEpic: boolean;
  /** Instruments this account cannot take (netting mode with a position the arena did not open). */
  blockedEpics?: ReadonlySet<string>;
}

export interface SlotCandidate {
  runId: string;
  epic: string;
  /** Higher is better; used for promotion. */
  score?: number;
}

export interface SlotPlan {
  /** runId → account name */
  assignments: Record<string, string>;
  unassigned: SlotCandidate[];
  promoted: string[];
  demoted: string[];
}

export interface Promotion {
  /** A waiting run replaces a mirrored one only if its score is higher by at least this much. */
  margin: number;
  maxSwaps: number;
  /** Whether a mirrored run can give up its slot now (e.g. it holds no position). */
  canDemote: (runId: string) => boolean;
}

export function assignSlots(
  current: Readonly<Record<string, string>>,
  accounts: readonly SlotAccount[],
  candidates: readonly SlotCandidate[],
  excluded: ReadonlySet<string>,
  promotion?: Promotion,
): SlotPlan {
  const state = new Map(accounts.map(a => [a.name, { ...a, used: 0, epics: new Set<string>() }]));
  const epicOf = new Map(candidates.map(c => [c.runId, c.epic]));
  const assignments: Record<string, string> = {};
  const fits = (s: SlotAccount & { used: number; epics: Set<string> }, epic: string) =>
    s.used < s.slots && (!s.onePerEpic || (!s.epics.has(epic) && !s.blockedEpics?.has(epic)));
  const take = (runId: string, epic: string, name: string) => {
    const s = state.get(name)!;
    s.used++;
    s.epics.add(epic);
    assignments[runId] = name;
  };

  for (const [runId, name] of Object.entries(current)) {
    const epic = epicOf.get(runId);
    const s = state.get(name);
    if (epic === undefined || !s || excluded.has(runId) || !fits(s, epic)) continue;
    take(runId, epic, name);
  }

  const unassigned: SlotCandidate[] = [];
  for (const c of candidates) {
    if (assignments[c.runId] !== undefined || excluded.has(c.runId)) continue;
    let best: string | null = null;
    let bestFree = 0;
    for (const s of state.values()) {
      const free = s.slots - s.used;
      if (fits(s, c.epic) && free > bestFree) {
        best = s.name;
        bestFree = free;
      }
    }
    if (best === null) unassigned.push(c);
    else take(c.runId, c.epic, best);
  }
  if (!promotion || unassigned.length === 0) return { assignments, unassigned, promoted: [], demoted: [] };

  const score = (runId: string) => candidates.find(c => c.runId === runId)?.score ?? 0;
  const waiting = [...unassigned].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const weakest = Object.keys(assignments)
    .filter(promotion.canDemote)
    .sort((a, b) => score(a) - score(b));
  const promoted: string[] = [];
  const demoted: string[] = [];
  for (const w of waiting) {
    if (promoted.length >= promotion.maxSwaps) break;
    const i = weakest.findIndex(m => {
      const s = state.get(assignments[m]!)!;
      return !s.onePerEpic || epicOf.get(m) === w.epic || (!s.epics.has(w.epic) && !s.blockedEpics?.has(w.epic));
    });
    const m = i < 0 ? undefined : weakest[i];
    if (m === undefined || (w.score ?? 0) < score(m) + promotion.margin) continue;
    weakest.splice(i, 1);
    const s = state.get(assignments[m]!)!;
    s.epics.delete(epicOf.get(m)!);
    s.epics.add(w.epic);
    assignments[w.runId] = assignments[m]!;
    delete assignments[m];
    promoted.push(w.runId);
    demoted.push(m);
  }
  const moved = new Set(promoted);
  const rest = unassigned.filter(c => !moved.has(c.runId)).concat(candidates.filter(c => demoted.includes(c.runId)));
  return { assignments, unassigned: rest, promoted, demoted };
}

/** How many more accounts of `slots` slots it takes to mirror every unassigned run. */
export function accountsNeeded(unassigned: readonly SlotCandidate[], slots: number, onePerEpic: boolean): number {
  if (unassigned.length === 0) return 0;
  const bySlots = Math.ceil(unassigned.length / slots);
  if (!onePerEpic) return bySlots;
  const perEpic = new Map<string, number>();
  for (const c of unassigned) perEpic.set(c.epic, (perEpic.get(c.epic) ?? 0) + 1);
  return Math.max(Math.max(...perEpic.values()), bySlots);
}

/**
 * Which demo run is mirrored on which broker account.
 *
 * An account nets positions per instrument, so it can hold at most one
 * mirrored run per instrument, and at most `slots` runs in total (its balance
 * is split across them). Assignments are sticky: a run keeps its account until
 * it stops, is excluded, or the account goes away. Free slots are filled in
 * candidate order (best first).
 */

export interface SlotAccount {
  name: string;
  slots: number;
  /** Instruments this account cannot take (e.g. it holds a position the arena did not open). */
  blockedEpics?: ReadonlySet<string>;
}

export interface SlotCandidate {
  runId: string;
  epic: string;
}

export interface SlotPlan {
  /** runId → account name */
  assignments: Record<string, string>;
  unassigned: SlotCandidate[];
}

export function assignSlots(
  current: Readonly<Record<string, string>>,
  accounts: readonly SlotAccount[],
  candidates: readonly SlotCandidate[],
  excluded: ReadonlySet<string>,
): SlotPlan {
  const state = new Map(accounts.map(a => [a.name, { ...a, used: 0, epics: new Set<string>() }]));
  const epicOf = new Map(candidates.map(c => [c.runId, c.epic]));
  const assignments: Record<string, string> = {};
  const fits = (s: { slots: number; used: number; epics: Set<string>; blockedEpics?: ReadonlySet<string> }, epic: string) =>
    s.used < s.slots && !s.epics.has(epic) && !s.blockedEpics?.has(epic);
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
  return { assignments, unassigned };
}

/** How many more accounts of `slots` slots it takes to mirror every unassigned run (one per instrument per account). */
export function accountsNeeded(unassigned: readonly SlotCandidate[], slots: number): number {
  if (unassigned.length === 0) return 0;
  const perEpic = new Map<string, number>();
  for (const c of unassigned) perEpic.set(c.epic, (perEpic.get(c.epic) ?? 0) + 1);
  return Math.max(Math.max(...perEpic.values()), Math.ceil(unassigned.length / slots));
}

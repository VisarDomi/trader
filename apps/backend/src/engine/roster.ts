/**
 * agents/roster.json: who runs where, without touching agent code.
 *
 * Editing an agent file changes its code hash and restarts the demo record of
 * every run it has, so these decisions live here instead (see agents/LIFECYCLE.md):
 *
 *   {
 *     "accounts": { "Arena 01": 1, "Arena 09": 200 },          demo account → leverage tier
 *     "leverage": {
 *       "default": 20,                                         tier for agents listed nowhere
 *       "agents": { "tsmom/20d": [1], "buy-hold": [1] }        agent id or file slug → tiers
 *     },
 *     "retired": { "ema-cross/9-21:US100@20": { "date": "2026-11-02", "reason": "losing: t = -1.6 over 41 trades" } }
 *   }
 *
 * An agent's tiers: the roster entry for its id, else for its slug, else its
 * file's `leverage`, else the default. Each tier is its own run; tiers that give
 * an instrument the same leverage (crypto and shares stop at 1:20) run once.
 *
 * Retired keys: "<agentId>", "<agentId>:<EPIC>", "<agentId>@<tier>" or
 * "<agentId>:<EPIC>@<tier>". Whole agents are normally retired by moving their
 * file to agents/_retired/ (the loader ignores "_" folders).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getInstrument } from './instruments.ts';
import { effectiveLeverage, isLeverageTier, LEVERAGE_TIERS } from './leverage.ts';
import type { LoadedAgent } from './loader.ts';
import { DEFAULT_AGENTS_DIR } from './loader.ts';

export const ROSTER_FILE = 'roster.json';
const FALLBACK_TIER = 20;

export interface RosterEntry {
  date: string;
  reason: string;
}

export interface Roster {
  /** Demo account name → leverage tier. Accounts not listed get no runs. */
  accounts: Record<string, number>;
  leverage: {
    default: number;
    agents: Record<string, number[]>;
  };
  retired: Record<string, RosterEntry>;
}

export interface PlannedRun {
  agent: LoadedAgent;
  epic: string;
  leverage: number;
}

export interface RetiredRun extends PlannedRun {
  entry: RosterEntry;
}

export function loadRoster(agentsDir: string = DEFAULT_AGENTS_DIR): Roster {
  const path = join(agentsDir, ROSTER_FILE);
  const parsed = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Partial<Roster>) : {};
  return {
    accounts: parsed.accounts ?? {},
    leverage: { default: parsed.leverage?.default ?? FALLBACK_TIER, agents: parsed.leverage?.agents ?? {} },
    retired: parsed.retired ?? {},
  };
}

/** Problems that would make the roster misbehave (checked by the tests before every deploy). */
export function rosterProblems(roster: Roster, agents: readonly LoadedAgent[]): string[] {
  const problems: string[] = [];
  const bad = (where: string, l: unknown) => `${where}: ${l} is not a leverage tier (${LEVERAGE_TIERS.join(', ')})`;
  if (!isLeverageTier(roster.leverage.default)) problems.push(bad('leverage.default', roster.leverage.default));
  for (const [name, l] of Object.entries(roster.accounts)) if (!isLeverageTier(l)) problems.push(bad(`accounts["${name}"]`, l));
  const ids = new Set(agents.flatMap(a => [a.id, a.slug]));
  for (const [id, tiers] of Object.entries(roster.leverage.agents)) {
    if (!ids.has(id)) problems.push(`leverage.agents["${id}"]: no such agent or file`);
    if (!Array.isArray(tiers) || tiers.length === 0) problems.push(`leverage.agents["${id}"]: list at least one tier`);
    for (const l of tiers ?? []) if (!isLeverageTier(l)) problems.push(bad(`leverage.agents["${id}"]`, l));
  }
  return problems;
}

export function leveragesFor(roster: Roster, agent: LoadedAgent): number[] {
  const tiers = roster.leverage.agents[agent.id] ?? roster.leverage.agents[agent.slug] ?? agent.def.leverage ?? [roster.leverage.default];
  return [...new Set(tiers)].sort((a, b) => a - b);
}

/** The roster entry that retires this agent × instrument × tier, if any. */
export function retiredBy(roster: Roster, agentId: string, epic: string, leverage: number): RosterEntry | null {
  const r = roster.retired;
  return r[`${agentId}:${epic}@${leverage}`] ?? r[`${agentId}:${epic}`] ?? r[`${agentId}@${leverage}`] ?? r[agentId] ?? null;
}

/** Every agent × instrument × tier that should run, and those the roster retires. */
export function planRuns(agents: readonly LoadedAgent[], roster: Roster): { runs: PlannedRun[]; retired: RetiredRun[] } {
  const runs: PlannedRun[] = [];
  const retired: RetiredRun[] = [];
  for (const agent of agents) {
    const tiers = leveragesFor(roster, agent);
    for (const epic of agent.def.instruments) {
      const seen = new Set<number>();
      for (const leverage of tiers) {
        const effective = effectiveLeverage(getInstrument(epic), leverage);
        if (seen.has(effective)) continue;
        seen.add(effective);
        const entry = retiredBy(roster, agent.id, epic, leverage);
        if (entry) retired.push({ agent, epic, leverage, entry });
        else runs.push({ agent, epic, leverage });
      }
    }
  }
  return { runs, retired };
}

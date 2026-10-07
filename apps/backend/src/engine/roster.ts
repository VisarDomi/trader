/**
 * agents/roster.json: runs retired without touching agent code.
 *
 * Editing an agent file changes its code hash and restarts the demo record of
 * every instrument it trades, so retiring one instrument of an agent is done
 * here instead. Keys are "<agentId>:<EPIC>" (one run) or "<agentId>" (every
 * instrument). Whole agents are normally retired by moving their file to
 * agents/_retired/ (the loader ignores "_" folders); see agents/LIFECYCLE.md.
 *
 *   { "retired": { "ema-cross/fast:US100": { "date": "2026-11-02", "reason": "losing: t = -1.6 over 41 trades" } } }
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_AGENTS_DIR } from './loader.ts';

export const ROSTER_FILE = 'roster.json';

export interface RosterEntry {
  date: string;
  reason: string;
}

export interface Roster {
  retired: Record<string, RosterEntry>;
}

export function loadRoster(agentsDir: string = DEFAULT_AGENTS_DIR): Roster {
  const path = join(agentsDir, ROSTER_FILE);
  if (!existsSync(path)) return { retired: {} };
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Roster>;
  return { retired: parsed.retired ?? {} };
}

/** The roster entry that retires this agent × instrument, if any. */
export function retiredBy(roster: Roster, agentId: string, epic: string): RosterEntry | null {
  return roster.retired[`${agentId}:${epic}`] ?? roster.retired[agentId] ?? null;
}

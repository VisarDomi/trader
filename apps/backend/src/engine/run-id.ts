/**
 * Run identities. A demo track record belongs to one agent version on one
 * instrument at one account leverage, so all four are in the id.
 * Agent ids may contain "/" (variants) but never ":".
 */

export const PRIMARY_BACKTEST_WINDOW_ID='2024-01_2026-09';
export function demoRunId(agentId: string, epic: string, leverage: number, codeHash: string): string {
  return `demo:${agentId}:${epic}:x${leverage}:${codeHash}`;
}

/** Stable id for the latest backtest; superseded code/engine results receive archived ids in the arena. */
export function backtestRunId(windowId: string, agentId: string, epic: string, leverage: number): string {
  return `bt:${windowId}:${agentId}:${epic}:x${leverage}`;
}

/** Joins a demo run with its backtest: "<agentId>:<EPIC>@<tier>" (also the roster's key for one run). */
export function runKey(agentId: string, epic: string, leverage: number): string {
  return `${agentId}:${epic}@${leverage}`;
}

export function parseDemoRunId(id: string): { agentId: string; epic: string; leverage: number; codeHash: string } | null {
  const m = /^demo:([^:]+):([^:]+):x(\d+):([^:]+)(?::delay=\d+)?$/.exec(id);
  return m ? { agentId: m[1]!, epic: m[2]!, leverage: Number(m[3]), codeHash: m[4]! } : null;
}

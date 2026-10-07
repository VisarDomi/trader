/**
 * Run identities. A demo track record belongs to one agent version on one
 * instrument at one account leverage, so all four are in the id.
 * Agent ids may contain "/" (variants) but never ":".
 */

export function demoRunId(agentId: string, epic: string, leverage: number, codeHash: string): string {
  return `demo:${agentId}:${epic}:x${leverage}:${codeHash}`;
}

/** One backtest per agent × instrument × leverage and window; a newer code version replaces it. */
export function backtestRunId(windowId: string, agentId: string, epic: string, leverage: number): string {
  return `bt:${windowId}:${agentId}:${epic}:x${leverage}`;
}

/** Joins a demo run with its backtest: "<agentId>:<EPIC>@<tier>" (also the roster's key for one run). */
export function runKey(agentId: string, epic: string, leverage: number): string {
  return `${agentId}:${epic}@${leverage}`;
}

export function parseDemoRunId(id: string): { agentId: string; epic: string; leverage: number; codeHash: string } | null {
  const m = /^demo:([^:]+):([^:]+):x(\d+):([^:]+)$/.exec(id);
  return m ? { agentId: m[1]!, epic: m[2]!, leverage: Number(m[3]), codeHash: m[4]! } : null;
}

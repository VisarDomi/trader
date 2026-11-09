/**
 * Where the arena's time goes, by part (user request 2026-11-09: run as many agents as possible on as
 * little as possible). The arena is single-threaded, so the wall time of synchronous work is its CPU time.
 * Parts are measured exclusively (no part contains another), so their shares add up.
 */
export class CpuBudget {
  private readonly totals = new Map<string, { ms: number; calls: number; maxMs: number }>();
  constructor(private readonly since = Date.now()) {}

  measure<T>(part: string, fn: () => T): T {
    const started = performance.now();
    try {
      return fn();
    } finally {
      this.add(part, performance.now() - started);
    }
  }

  add(part: string, ms: number): void {
    const t = this.totals.get(part);
    if (t) {
      t.ms += ms;
      t.calls++;
      if (ms > t.maxMs) t.maxMs = ms;
    } else this.totals.set(part, { ms, calls: 1, maxMs: ms });
  }

  report(now = Date.now()): { sinceMs: number; parts: { part: string; ms: number; calls: number; maxMs: number; corePercent: number }[] } {
    const elapsed = Math.max(1, now - this.since);
    return {
      sinceMs: elapsed,
      parts: [...this.totals]
        .map(([part, t]) => ({ part, ms: Math.round(t.ms), calls: t.calls, maxMs: Math.round(t.maxMs), corePercent: Math.round((t.ms / elapsed) * 10_000) / 100 }))
        .sort((a, b) => b.ms - a.ms),
    };
  }
}

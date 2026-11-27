/**
 * Names the cause of every long event-loop stall in the arena.
 *
 * The arena is single-threaded: while synchronous work runs, quotes, API requests and the tick archive wait.
 * A 1 s timer that fires late measures each stall. Its report splits the stall into the arena's measured parts
 * (CpuBudget), the process's own CPU time, and the time the kernel made its cgroup wait for CPU or memory
 * (pressure stall information). So a stall is either our code (CPU ≈ stall, a named part), CPU contention from
 * other workloads (CPU pressure ≈ stall) or swapping (memory pressure ≈ stall).
 */
import { readFileSync } from 'node:fs';
import type { CpuBudget } from './cpu-budget.ts';

export const STALL_REPORT_MS = 5_000;
const TICK_MS = 1_000;

export interface Pressure {
  /** Microseconds some task of the cgroup waited for CPU. */
  cpuUs: number;
  /** Microseconds some task of the cgroup waited for memory (reclaim, swap-in). */
  memoryUs: number;
}

export interface StallReport {
  at: number;
  stallMs: number;
  processCpuMs: number;
  parts: { part: string; ms: number }[];
  unmeasuredMs: number;
  cpuWaitMs: number | null;
  memoryWaitMs: number | null;
}

/** This process's cgroup pressure totals, or null outside a cgroup v2 hierarchy. */
export function cgroupPressure(): Pressure | null {
  try {
    const line = readFileSync('/proc/self/cgroup', 'utf8').split('\n').find(l => l.startsWith('0::'));
    if (!line) return null;
    const dir = `/sys/fs/cgroup${line.slice(3).trim()}`;
    const some = (file: string) => Number(/^some .*total=(\d+)/m.exec(readFileSync(`${dir}/${file}`, 'utf8'))?.[1]);
    const cpuUs = some('cpu.pressure'),
      memoryUs = some('memory.pressure');
    return Number.isFinite(cpuUs) && Number.isFinite(memoryUs) ? { cpuUs, memoryUs } : null;
  } catch {
    return null;
  }
}

export function describeStall(r: StallReport): string {
  const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const parts = r.parts.filter(p => p.ms >= 100).map(p => `${p.part} ${s(p.ms)}`);
  if (r.unmeasuredMs >= 100) parts.push(`unmeasured ${s(r.unmeasuredMs)}`);
  const waits = r.cpuWaitMs === null ? 'cgroup waits unavailable' : `cgroup waited ${s(r.cpuWaitMs)} for CPU, ${s(r.memoryWaitMs ?? 0)} for memory`;
  return `event loop stalled ${s(r.stallMs)}: process CPU ${s(r.processCpuMs)} (${parts.join(', ') || 'no measured part'}); ${waits}`;
}

export class StallMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private lastCpu = process.cpuUsage();
  private lastParts = new Map<string, number>();
  private lastPressure: Pressure | null = null;
  stalls = 0;
  maxStallMs = 0;
  last: StallReport | null = null;

  constructor(
    private readonly cpu: CpuBudget,
    private readonly report: (r: StallReport) => void,
    private readonly thresholdMs = STALL_REPORT_MS,
    private readonly pressure: () => Pressure | null = cgroupPressure,
  ) {}

  start(): void {
    this.mark(performance.now());
    this.timer = setInterval(() => this.check(performance.now()), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One timer tick at monotonic time `now`; public for tests. */
  check(now: number): StallReport | null {
    const stallMs = now - this.lastTick - TICK_MS;
    let out: StallReport | null = null;
    if (stallMs >= this.thresholdMs) {
      const cpu = process.cpuUsage(this.lastCpu);
      const parts = [...this.cpu.totalsMs()]
        .map(([part, ms]) => ({ part, ms: ms - (this.lastParts.get(part) ?? 0) }))
        .filter(p => p.ms > 0)
        .sort((a, b) => b.ms - a.ms);
      const measured = parts.reduce((n, p) => n + p.ms, 0);
      const pressure = this.pressure();
      const before = this.lastPressure;
      const processCpuMs = (cpu.user + cpu.system) / 1000;
      out = {
        at: Date.now(),
        stallMs,
        processCpuMs,
        parts,
        unmeasuredMs: Math.max(0, stallMs - measured),
        cpuWaitMs: pressure && before ? (pressure.cpuUs - before.cpuUs) / 1000 : null,
        memoryWaitMs: pressure && before ? (pressure.memoryUs - before.memoryUs) / 1000 : null,
      };
      this.stalls++;
      this.maxStallMs = Math.max(this.maxStallMs, stallMs);
      this.last = out;
      this.report(out);
    }
    this.mark(now);
    return out;
  }

  private mark(now: number): void {
    this.lastTick = now;
    this.lastCpu = process.cpuUsage();
    this.lastParts = this.cpu.totalsMs();
    this.lastPressure = this.pressure();
  }
}

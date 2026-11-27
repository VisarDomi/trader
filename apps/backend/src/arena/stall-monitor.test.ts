import { expect, test } from 'bun:test';
import { CpuBudget } from './cpu-budget.ts';
import { describeStall, StallMonitor, type Pressure, type StallReport } from './stall-monitor.ts';
import { describeSample, summarizeSamples, type ProbeSample } from './stall-probe.ts';

test('a late timer reports the stall split into measured parts, cgroup waits and where the thread was blocked', () => {
  const cpu = new CpuBudget();
  let pressure: Pressure = { cpuUs: 1_000_000, memoryUs: 0, ioUs: 0 };
  const reports: StallReport[] = [];
  const samples: ProbeSample[] = [];
  const monitor = new StallMonitor(cpu, r => reports.push(r), 5_000, () => pressure);
  monitor.start({ beat: () => {}, samples });
  const t0 = performance.now();
  expect(monitor.check(t0 + 1_000)).toBeNull();
  cpu.add('persist', 9_000);
  cpu.add('quotes', 50);
  pressure = { cpuUs: 3_500_000, memoryUs: 250_000, ioUs: 1_500_000 };
  const blocked = (dt: number, syscall: number | null, wchan: string | null, state: string): ProbeSample => {
    const s: ProbeSample = { at: Date.now() - dt, syscall, file: '/data/arena.db-wal', wchan, state, text: '' };
    s.text = describeSample(s);
    return s;
  };
  samples.push(blocked(4_000, 75, 'jbd2_log_wait_commit', 'D'), blocked(3_000, 75, 'jbd2_log_wait_commit', 'D'), blocked(2_000, null, null, 'R'));
  const r = monitor.check(t0 + 13_000)!;
  expect(r.stallMs).toBeCloseTo(11_000, -1);
  expect(r.parts).toEqual([{ part: 'persist', ms: 9_000 }, { part: 'quotes', ms: 50 }]);
  expect(r.unmeasuredMs).toBeCloseTo(1_950, -1);
  expect(r.cpuWaitMs).toBe(2_500);
  expect(r.memoryWaitMs).toBe(250);
  expect(r.ioWaitMs).toBe(1_500);
  // The probe's samples reach the main thread after it unblocks: the report waits one tick for them.
  expect(reports).toHaveLength(0);
  monitor.check(t0 + 14_000);
  expect(reports).toHaveLength(1);
  expect(r.blockedIn).toBe('fdatasync(arena.db-wal) in jbd2_log_wait_commit [D] 2/3, running 1/3');
  expect(monitor.stalls).toBe(1);
  expect(describeStall({ ...r, stallMs: 11_000, processCpuMs: 9_100, unmeasuredMs: 2_000 })).toBe(
    'event loop stalled 11.0 s: process CPU 9.1 s (persist 9.0 s, unmeasured 2.0 s); cgroup waited 2.5 s for CPU, 0.3 s for memory, 1.5 s for I/O; main thread seen in fdatasync(arena.db-wal) in jbd2_log_wait_commit [D] 2/3, running 1/3',
  );
  // Parts are differences: the next stall does not repeat this one's persist time.
  expect(monitor.check(t0 + 21_000)!.parts).toEqual([]);
  monitor.stop();
  expect(reports).toHaveLength(2);
});

test('stalls below the threshold, a missing probe and missing pressure files are tolerated', () => {
  const reports: StallReport[] = [];
  const monitor = new StallMonitor(new CpuBudget(), r => reports.push(r), 5_000, () => null);
  monitor.start();
  const t0 = performance.now();
  expect(monitor.check(t0 + 4_000)).toBeNull();
  const r = monitor.check(t0 + 4_000 + 7_000)!;
  monitor.stop();
  expect(reports).toEqual([r]);
  expect(r.cpuWaitMs).toBeNull();
  expect(r.blockedIn).toBeNull();
  expect(describeStall(r)).toContain('cgroup waits unavailable');
  expect(summarizeSamples([])).toBeNull();
});

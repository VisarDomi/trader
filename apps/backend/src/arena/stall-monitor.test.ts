import { expect, test } from 'bun:test';
import { CpuBudget } from './cpu-budget.ts';
import { describeStall, StallMonitor, type Pressure, type StallReport } from './stall-monitor.ts';

test('a late timer reports the stall split into measured parts and cgroup waits', () => {
  const cpu = new CpuBudget();
  let pressure: Pressure = { cpuUs: 1_000_000, memoryUs: 0 };
  const reports: StallReport[] = [];
  const monitor = new StallMonitor(cpu, r => reports.push(r), 5_000, () => pressure);
  monitor.start();
  monitor.stop();
  const t0 = performance.now();
  expect(monitor.check(t0 + 1_000)).toBeNull();
  cpu.add('persist', 9_000);
  cpu.add('quotes', 50);
  pressure = { cpuUs: 3_500_000, memoryUs: 250_000 };
  const r = monitor.check(t0 + 13_000)!;
  expect(r.stallMs).toBeCloseTo(11_000, -1);
  expect(r.parts).toEqual([{ part: 'persist', ms: 9_000 }, { part: 'quotes', ms: 50 }]);
  expect(r.unmeasuredMs).toBeCloseTo(1_950, -1);
  expect(r.cpuWaitMs).toBe(2_500);
  expect(r.memoryWaitMs).toBe(250);
  expect(reports).toHaveLength(1);
  expect(monitor.stalls).toBe(1);
  expect(describeStall({ ...r, stallMs: 11_000, processCpuMs: 9_100, unmeasuredMs: 2_000 })).toBe(
    'event loop stalled 11.0 s: process CPU 9.1 s (persist 9.0 s, unmeasured 2.0 s); cgroup waited 2.5 s for CPU, 0.3 s for memory',
  );
  // Parts are differences: the next stall does not repeat this one's persist time.
  expect(monitor.check(t0 + 20_000)!.parts).toEqual([]);
});

test('stalls below the threshold and missing pressure files are tolerated', () => {
  const monitor = new StallMonitor(new CpuBudget(), () => {}, 5_000, () => null);
  monitor.start();
  monitor.stop();
  const t0 = performance.now();
  expect(monitor.check(t0 + 4_000)).toBeNull();
  const r = monitor.check(t0 + 4_000 + 7_000)!;
  expect(r.cpuWaitMs).toBeNull();
  expect(describeStall(r)).toContain('cgroup waits unavailable');
});

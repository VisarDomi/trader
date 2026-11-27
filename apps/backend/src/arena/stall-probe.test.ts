import { expect, test } from 'bun:test';
import { startStallProbe, summarizeSamples } from './stall-probe.ts';

test.skipIf(process.platform !== 'linux')('the worker sees where the blocked main thread waits', async () => {
  const probe = startStallProbe()!;
  await Bun.sleep(300);
  probe.beat();
  Bun.sleepSync(4_200);
  await Bun.sleep(300);
  probe.stop();
  expect(probe.samples.length).toBeGreaterThan(0);
  expect(summarizeSamples(probe.samples)).toContain('nanosleep');
}, 10_000);

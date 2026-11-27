/**
 * Runs beside the arena's main thread and looks at it while it is blocked. The main thread writes a heartbeat
 * into shared memory every second; when the heartbeat is late, this worker reads the main thread's current
 * system call, the file it is acting on and the kernel function it sleeps in from /proc, once a second, and
 * posts each sample. Only a second thread can see where a blocked thread is.
 */
import { readFileSync, readlinkSync } from 'node:fs';
import { describeSample, type ProbeSample } from './stall-probe.ts';

declare const self: Worker;
const LATE_MS = 2_500;
const SAMPLE_MS = 1_000;
const MAX_SAMPLES = 60;

self.onmessage = (e: MessageEvent<{ heartbeat: SharedArrayBuffer; tid: number }>) => {
  const beat = new Float64Array(e.data.heartbeat);
  const task = `/proc/self/task/${e.data.tid}`;
  let lastSample = 0;
  let taken = 0;
  setInterval(() => {
    const now = Date.now();
    if (now - beat[0]! < LATE_MS) {
      taken = 0;
      return;
    }
    if (now - lastSample < SAMPLE_MS || taken >= MAX_SAMPLES) return;
    lastSample = now;
    taken++;
    self.postMessage(sample(task, now));
  }, 250);
};

function sample(task: string, at: number): ProbeSample {
  const read = (f: string) => {
    try {
      return readFileSync(`${task}/${f}`, 'utf8').trim();
    } catch {
      return '';
    }
  };
  const fields = read('syscall').split(' ');
  const nr = /^\d+$/.test(fields[0] ?? '') ? Number(fields[0]) : null;
  let file: string | null = null;
  if (nr !== null && fields[1]) {
    try {
      file = readlinkSync(`/proc/self/fd/${Number.parseInt(fields[1], 16)}`);
    } catch {
      file = null;
    }
  }
  const state = read('stat').split(') ')[1]?.[0] ?? '?';
  const s: ProbeSample = { at, syscall: nr, file, wchan: read('wchan') || null, state, text: '' };
  s.text = describeSample(s);
  return s;
}

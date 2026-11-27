/**
 * Where the arena's main thread was blocked during a stall: samples taken by stall-probe.worker.ts.
 * The worker reads /proc while the main thread cannot run, so a stall spent off-CPU (disk, fsync, a lock)
 * is reported with the system call, the file and the kernel wait point that held it.
 */
import { basename } from 'node:path';

export interface ProbeSample {
  at: number;
  /** x86-64 system call number, or null while running in user space. */
  syscall: number | null;
  file: string | null;
  /** Kernel function the thread sleeps in. */
  wchan: string | null;
  /** R running, S sleeping, D uninterruptible (usually disk). */
  state: string;
  text: string;
}

const SYSCALLS: Record<number, string> = {
  0: 'read', 1: 'write', 3: 'close', 7: 'poll', 8: 'lseek', 9: 'mmap', 11: 'munmap', 17: 'pread64', 18: 'pwrite64',
  19: 'readv', 20: 'writev', 23: 'select', 28: 'madvise', 35: 'nanosleep', 72: 'fcntl', 74: 'fsync', 75: 'fdatasync',
  77: 'ftruncate', 82: 'rename', 87: 'unlink', 202: 'futex', 230: 'clock_nanosleep', 232: 'epoll_wait', 257: 'openat',
  262: 'newfstatat', 270: 'pselect6', 271: 'ppoll', 281: 'epoll_pwait', 285: 'fallocate', 295: 'preadv', 296: 'pwritev',
};
const FILE_SYSCALLS = new Set([0, 1, 8, 17, 18, 19, 20, 72, 74, 75, 77, 285, 295, 296]);

export function describeSample(s: ProbeSample): string {
  if (s.syscall === null) return s.state === 'R' ? 'running' : `user space (${s.state})`;
  const name = SYSCALLS[s.syscall] ?? `syscall ${s.syscall}`;
  const file = FILE_SYSCALLS.has(s.syscall) && s.file ? `(${basename(s.file)})` : '';
  return `${name}${file}${s.wchan && s.wchan !== '0' ? ` in ${s.wchan}` : ''}${s.state === 'D' ? ' [D]' : ''}`;
}

/** "fsync(arena.db) in jbd2_log_wait_commit [D] 20/26, running 6/26". */
export function summarizeSamples(samples: readonly ProbeSample[]): string | null {
  if (!samples.length) return null;
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(s.text, (counts.get(s.text) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([text, n]) => `${text} ${n}/${samples.length}`)
    .join(', ');
}

/** Starts the worker; returns the heartbeat to call every second and the samples posted so far. */
export function startStallProbe(): { beat: () => void; samples: ProbeSample[]; stop: () => void } | null {
  try {
    const heartbeat = new SharedArrayBuffer(8);
    const view = new Float64Array(heartbeat);
    view[0] = Date.now();
    const samples: ProbeSample[] = [];
    const worker = new Worker(new URL('./stall-probe.worker.ts', import.meta.url).href);
    worker.onmessage = (e: MessageEvent<ProbeSample>) => {
      samples.push(e.data);
      if (samples.length > 600) samples.splice(0, samples.length - 600);
    };
    worker.postMessage({ heartbeat, tid: process.pid });
    worker.unref?.();
    return { beat: () => (view[0] = Date.now()), samples, stop: () => worker.terminate() };
  } catch {
    return null;
  }
}

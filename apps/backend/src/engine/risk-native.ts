import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentRun } from './run.ts';
import type { Tick } from './ticks.ts';
import { fundingDay } from './clock.ts';

export const RISK_INPUT_WIDTH = 11;
export const RISK_OUTPUT_WIDTH = 4;
export const RISK_BACKEND = { JS: 'js', NATIVE: 'native', AUTO: 'auto' } as const;
export const RISK_ABI_VERSION = 1;
const MIN_BATCH_RUNS = 16;
const path = resolve(import.meta.dir, '../../native/trader-risk.node');
interface NativeRisk {
  abiVersion(): number;
  evaluate(input: Buffer, output: Buffer, count: number, bid: number, ask: number): void;
}
// Keep the fastest measured backend as default. Native remains explicit until its
// end-to-end advantage (including the language boundary) beats the reference path.
const requested = process.env.TRADER_RISK_BACKEND ?? RISK_BACKEND.JS;
if (!Object.values(RISK_BACKEND).includes(requested as typeof RISK_BACKEND[keyof typeof RISK_BACKEND]))
  throw new Error(`invalid TRADER_RISK_BACKEND: ${requested}`);
let native: NativeRisk | null = null;
if (requested !== RISK_BACKEND.JS && existsSync(path)) {
  native = createRequire(import.meta.url)(path) as NativeRisk;
  if (native.abiVersion() !== RISK_ABI_VERSION) throw new Error('native risk ABI mismatch; rebuild the native module');
  const input = new Float64Array([1, 10, 100, 1000, 1000, 0, 95, NaN, 110, 100, 0.05]);
  const output = new Float64Array(RISK_OUTPUT_WIDTH);
  native.evaluate(Buffer.from(input.buffer), Buffer.from(output.buffer), 1, 94, 95);
  if (output[0] !== 1 || output[1] !== 1000 || output[2] !== 0.06 || output[3] !== 100)
    throw new Error('native risk buffer canary failed');
} else if (requested === RISK_BACKEND.NATIVE) throw new Error('native risk module missing; run bun run build-native');
export const riskBackend = native ? RISK_BACKEND.NATIVE : RISK_BACKEND.JS;

/** Reused instrument-local buffers; one synchronous native call, no per-run IPC or JSON. */
export class RiskBatch {
  constructor(private readonly enabled = true) {}
  private input = new Float64Array(0);
  private output = new Float64Array(0);
  private inputBytes = Buffer.alloc(0);
  private outputBytes = Buffer.alloc(0);
  private count = 0;
  private day: number | null = null;
  private readonly dirty = new Set<number>();
  invalidate(): void { this.count = -1; }
  evaluate(runs: readonly AgentRun[], q: Tick): Float64Array | undefined {
    if (!this.enabled || !native || runs.length < MIN_BATCH_RUNS) return;
    if (this.count !== runs.length) {
      this.count = runs.length;
      this.input = new Float64Array(runs.length * RISK_INPUT_WIDTH);
      this.output = new Float64Array(runs.length * RISK_OUTPUT_WIDTH);
      this.inputBytes = Buffer.from(this.input.buffer);
      this.outputBytes = Buffer.from(this.output.buffer);
      this.dirty.clear();
      for (let i = 0; i < runs.length; i++) {
        this.dirty.add(i);
        runs[i]!.bindRisk(() => { this.input[i * RISK_INPUT_WIDTH] = 0; this.dirty.add(i); });
      }
    }
    const day = fundingDay(q.receivedAt);
    if (day !== this.day) {
      this.day = day;
      for (let i = 0; i < runs.length; i++) this.dirty.add(i);
    }
    for (const i of this.dirty) {
      const offset = i * RISK_INPUT_WIDTH;
      if (!runs[i]!.writeRisk(this.input, offset, q, day)) this.input[offset] = 0;
    }
    this.dirty.clear();
    native.evaluate(this.inputBytes, this.outputBytes, runs.length, q.bid, q.ask);
    return this.output;
  }
}

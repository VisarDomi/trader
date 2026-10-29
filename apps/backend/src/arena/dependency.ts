import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DependencyEvidence } from '@trader/shared/types';
import type { ArenaDB } from './db.ts';

const HISTORY_KEY = 'evidence.forecaster-availability-v1';
const MARKER = join(homedir(), '.local/share/heavy-resources/user-pause.json');
const HOLD_CHECK_MS = 10_000;
type State = DependencyEvidence['state'];
interface Interval { from:number; to:number|null; state:State }
interface History { trackedSince:number; intervals:Interval[] }

/** Only confirmed/explicitly recorded downtime is removed from the observation clock. */
export class ForecastAvailability {
  private history: History | null;
  private holdCheckedAt = -Infinity;
  private holdSince: number | null = null;
  constructor(private readonly db: ArenaDB, private readonly marker = MARKER) {
    this.history = db.getSetting<History|null>(HISTORY_KEY,null);
  }
  observe(reachable: boolean, now: number): void {
    if (now - this.holdCheckedAt >= HOLD_CHECK_MS) {
      this.holdCheckedAt = now; this.holdSince = null;
      if (existsSync(this.marker)) {
        try {
          const raw = JSON.parse(readFileSync(this.marker,'utf8')).paused_at;
          const at = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(raw);
          const since = Number.isFinite(at) ? at : statSync(this.marker).mtimeMs;
          if (since > 0 && since <= now) this.holdSince = since;
        } catch { try { this.holdSince = Math.min(now,statSync(this.marker).mtimeMs); } catch { this.holdSince = null; } }
      }
    }
    const state: State = reachable ? 'available' : this.holdSince !== null ? 'user-paused' : 'unavailable';
    if (!this.history) {
      // The durable stop marker explicitly records the current hold's start. Other past
      // outages are unknown, not back-filled from an absent success timestamp.
      const from = state === 'user-paused' ? this.holdSince! : now;
      this.history = {trackedSince:from,intervals:[{from,to:null,state}]};
      this.save(); return;
    }
    const last = this.history.intervals.at(-1)!;
    if (last.state === state) return;
    last.to = Math.max(last.from,now);
    this.history.intervals.push({from:Math.max(last.from,now),to:null,state});
    this.save();
  }
  evidence(since: number, now: number): DependencyEvidence | undefined {
    if (!this.history) return;
    const last = this.history.intervals.at(-1)!;
    const pausedMs = this.history.intervals.reduce((n,i) => n + (i.state === 'available' ? 0
      : Math.max(0,Math.min(now,i.to??now)-Math.max(since,i.from))),0);
    return {state:last.state,since:last.from,trackedSince:this.history.trackedSince,pausedMs,
      note:last.state === 'user-paused' ? 'TimesFM is paused by the resource hold; price risk checks continue.'
        : last.state === 'unavailable' ? 'Fresh TimesFM forecasts are unavailable; price risk checks continue.'
        : 'TimesFM is reachable. Earlier unrecorded outages are unknown.'};
  }
  private save():void { this.db.setSetting(HISTORY_KEY,this.history); }
}

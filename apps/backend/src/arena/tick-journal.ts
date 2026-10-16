/** Append-only quote spool, separate from arena state. Only lab-acknowledged rows can expire. */
import { Database } from 'bun:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CaptureSession, RecordedTick, TickExport } from '../engine/ticks.ts';
import { TICK_EXPORT_LIMIT } from '../engine/ticks.ts';
import { DAY_MS } from '../engine/clock.ts';
const FLUSH_MS = 250;
const BATCH_SIZE = 512;
const RETAIN_ACKED_MS = 2 * DAY_MS;
const PRUNE_BATCH = 50_000;
const DISK_WARNING_BYTES = 2 * 1024 ** 3;
export class TickJournal {
  readonly db: Database;
  readonly journalId: string;
  private session: number | null = null;
  private nextId: number;
  private pending: RecordedTick[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPrune = 0;
  private lastErrorAt = 0;
  lastError: string | null = null;
  lostTicks = 0;
  invalidMessages = 0;
  constructor(readonly path: string, private readonly log: (message: string) => void = () => {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;
      PRAGMA auto_vacuum=INCREMENTAL;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ticks(id INTEGER PRIMARY KEY,session INTEGER NOT NULL,epic TEXT NOT NULL,t INTEGER NOT NULL,received_at INTEGER NOT NULL,bid REAL NOT NULL,ask REAL NOT NULL,timestamp_fallback INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY,started_at INTEGER NOT NULL,ended_at INTEGER,last_received_at INTEGER NOT NULL,reason TEXT,epics TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS stats(epic TEXT PRIMARY KEY,n INTEGER NOT NULL,first_received_at INTEGER NOT NULL,last_received_at INTEGER NOT NULL,last_quote_at INTEGER NOT NULL);
    `);
    this.db.query('INSERT OR IGNORE INTO meta VALUES (?,?)').run('journalId', crypto.randomUUID());
    this.db.query('INSERT OR IGNORE INTO meta VALUES (?,?)').run('ack', '0');
    this.journalId = (this.db.query('SELECT value FROM meta WHERE key=?').get('journalId') as {value:string}).value;
    this.nextId = this.highWater();
    // A crash is a coverage gap, never a fictitious continuously connected session.
    this.db.exec("UPDATE sessions SET ended_at=last_received_at,reason='process interrupted' WHERE ended_at IS NULL");
  }
  start(): void { this.timer ??= setInterval(() => this.flush(), FLUSH_MS); }
  connected(epics: readonly string[], now = Date.now()): void {
    this.disconnected('reconnected', now);
    const r = this.db.query('INSERT INTO sessions(started_at,last_received_at,epics) VALUES (?,?,?)').run(now, now, JSON.stringify(epics));
    this.session = Number(r.lastInsertRowid);
  }
  disconnected(reason: string, now = Date.now()): void {
    this.flush();
    if (this.session !== null) this.db.query('UPDATE sessions SET ended_at=?,reason=? WHERE id=?').run(now, reason, this.session);
    this.session = null;
  }
  invalid(): void { this.invalidMessages++; }
  record(q: {epic:string;time:number;receivedAt:number;bid:number;ask:number;timestampFallback?:boolean}): number {
    const id = ++this.nextId;
    this.pending.push({ id, session:this.session ?? 0, epic:q.epic, time:q.time, receivedAt:q.receivedAt, bid:q.bid, ask:q.ask, timestampFallback:q.timestampFallback ? 1 : 0 });
    if (this.pending.length >= BATCH_SIZE) this.flush();
    return id;
  }
  flush(): void {
    if (!this.pending.length) return;
    const batch = this.pending;
    try {
      const insert = this.db.query('INSERT INTO ticks VALUES (?,?,?,?,?,?,?,?)');
      const stat = this.db.query(`INSERT INTO stats VALUES (?,1,?,?,?) ON CONFLICT(epic) DO UPDATE SET n=n+1,last_received_at=excluded.last_received_at,last_quote_at=excluded.last_quote_at`);
      this.db.transaction(() => {
        for (const q of batch) {
          insert.run(q.id,q.session,q.epic,q.time,q.receivedAt,q.bid,q.ask,q.timestampFallback);
          stat.run(q.epic,q.receivedAt,q.receivedAt,q.time);
        }
        if (this.session !== null) this.db.query('UPDATE sessions SET last_received_at=? WHERE id=?').run(batch.at(-1)!.receivedAt,this.session);
      })();
      this.pending = [];
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      // Retry a bounded buffer; make any unavoidable loss visible instead of exhausting shared RAM.
      if (this.pending.length > 20_000) { this.lostTicks += this.pending.length - 20_000; this.pending.splice(0,this.pending.length-20_000); }
      if (Date.now()-this.lastErrorAt > 60_000) { this.lastErrorAt=Date.now();this.log(`tick recording failed: ${this.lastError}; lost=${this.lostTicks}`); }
    }
  }
  export(after: number, limit = TICK_EXPORT_LIMIT): TickExport {
    this.flush();
    if (!Number.isSafeInteger(after) || after < 0) throw new Error('invalid tick cursor');
    const ticks = this.db.query(`SELECT id,session,epic,t time,received_at receivedAt,bid,ask,timestamp_fallback timestampFallback FROM ticks WHERE id>? ORDER BY id LIMIT ?`).all(after,Math.max(1,Math.min(TICK_EXPORT_LIMIT,limit))) as RecordedTick[];
    const sessions = this.db.query(`SELECT id,started_at startedAt,ended_at endedAt,last_received_at lastReceivedAt,reason,epics FROM sessions ORDER BY id`).all() as CaptureSession[];
    return {journalId:this.journalId,highWater:this.highWater(),acknowledged:this.acknowledged(),ticks,sessions};
  }
  acknowledge(journalId: string, through: number): void {
    if (journalId !== this.journalId || !Number.isSafeInteger(through) || through < this.acknowledged() || through > this.highWater()) throw new Error('invalid journal acknowledgement');
    this.db.query('UPDATE meta SET value=? WHERE key=?').run(String(through),'ack');
  }
  maintain(now=Date.now()): void {
    if (now-this.lastPrune < 300_000) return;
    this.lastPrune=now;
    this.db.query('DELETE FROM ticks WHERE id IN (SELECT id FROM ticks WHERE id<=? AND received_at<? ORDER BY id LIMIT ?)').run(this.acknowledged(),now-RETAIN_ACKED_MS,PRUNE_BATCH);
    this.db.exec('PRAGMA wal_checkpoint(PASSIVE); PRAGMA incremental_vacuum(1000)');
  }
  private highWater(): number {return Math.max(Number((this.db.query('SELECT MAX(id) n FROM ticks').get() as {n:number|null}).n ?? 0),this.acknowledged());}
  private acknowledged(): number {return Number((this.db.query('SELECT value FROM meta WHERE key=?').get('ack') as {value:string}).value);}
  status() {
    const bytes = this.path === ':memory:' ? 0 : ['', '-wal'].reduce((n,suffix)=>{try{return n+statSync(this.path+suffix).size;}catch{return n;}},0);
    return {journalId:this.journalId,highWater:this.highWater(),acknowledged:this.acknowledged(),buffered:this.pending.length,lostTicks:this.lostTicks,invalidMessages:this.invalidMessages,lastError:this.lastError,bytes,diskWarning:bytes>DISK_WARNING_BYTES,
      flushIntervalMs:FLUSH_MS,instruments:this.db.query('SELECT epic,n,first_received_at firstReceivedAt,last_received_at lastReceivedAt,last_quote_at lastQuoteAt FROM stats ORDER BY epic').all(),
      session:this.session,retention:'Unacknowledged ticks retained; acknowledged ticks retained at least 2 days; 250 ms buffer, flushed on graceful shutdown.'};
  }
  close(): void { if(this.timer)clearInterval(this.timer);this.timer=null;this.disconnected('graceful shutdown');this.db.close(); }
}

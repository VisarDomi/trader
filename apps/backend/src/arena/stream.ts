/**
 * Live quotes from the Capital.com streaming API for every instrument on one
 * WebSocket. Quotes drive tick-precision stops and fill prices; 1-minute
 * candles come from the REST API instead (same source as the backtest history).
 *
 * Reconnects with back-off and fresh session tokens, and a watchdog forces a
 * reconnect when quotes stop arriving.
 */
import type { CapitalClient } from '../capital/client.ts';
import { STREAM_URL } from '../capital/client.ts';

const DEST_SUBSCRIBE = 'marketData.subscribe';
const DEST_QUOTE = 'quote';
const DEST_PING = 'ping';
const PING_INTERVAL_MS = 4 * 60_000;
const WATCHDOG_INTERVAL_MS = 30_000;
/** Crypto quotes around the clock, so silence this long means the socket is dead. */
const STALE_AFTER_MS = 150_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];

export interface LiveQuote {
  epic: string;
  bid: number;
  ask: number;
  time: number;
}

export class QuoteStream {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private correlation = 0;
  readonly lastQuote = new Map<string, LiveQuote>();
  connectedSince = 0;
  reconnects = 0;

  constructor(
    private readonly client: CapitalClient,
    private readonly epics: string[],
    private readonly onQuote: (q: LiveQuote) => void,
    private readonly log: (level: 'info' | 'warn' | 'error', msg: string) => void,
  ) {}

  start(): void {
    this.stopped = false;
    void this.connect();
    this.watchdogTimer = setInterval(() => this.watchdog(), WATCHDOG_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.teardown();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.client.login();
    } catch (err) {
      this.log('error', `stream login failed: ${err instanceof Error ? err.message : err}`);
      return this.scheduleReconnect();
    }
    const { cst, securityToken } = this.client.tokens();
    const ws = new WebSocket(STREAM_URL);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.connectedSince = Date.now();
      this.lastMessageAt = Date.now();
      ws.send(JSON.stringify({ destination: DEST_SUBSCRIBE, correlationId: String(++this.correlation), cst, securityToken, payload: { epics: this.epics } }));
      this.pingTimer = setInterval(() => {
        const t = this.client.tokens();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ destination: DEST_PING, correlationId: String(++this.correlation), cst: t.cst, securityToken: t.securityToken }));
        }
      }, PING_INTERVAL_MS);
      this.log('info', `stream connected, subscribed to ${this.epics.length} instruments`);
    };
    ws.onmessage = event => {
      this.lastMessageAt = Date.now();
      let msg: { destination?: string; status?: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.destination === DEST_QUOTE && msg.payload) {
        const p = msg.payload as { epic: string; bid: number; ofr: number; timestamp?: number };
        if (typeof p.bid !== 'number' || typeof p.ofr !== 'number') return;
        this.handleQuote({ epic: p.epic, bid: p.bid, ask: p.ofr, time: typeof p.timestamp === 'number' ? p.timestamp : Date.now() });
      } else if (msg.destination === DEST_SUBSCRIBE && msg.status !== 'OK') {
        this.log('error', `subscribe failed: ${JSON.stringify(msg).slice(0, 300)}`);
      }
    };
    ws.onclose = event => {
      this.clearPing();
      if (this.ws === ws) this.ws = null;
      if (!this.stopped) {
        this.log('warn', `stream closed (code ${event.code}); reconnecting`);
        this.scheduleReconnect();
      }
    };
    ws.onerror = () => {
      // onclose follows and handles the reconnect.
    };
  }

  private handleQuote(q: LiveQuote): void {
    this.lastQuote.set(q.epic, q);
    this.onQuote(q);
  }

  private watchdog(): void {
    if (this.stopped || !this.ws) return;
    if (Date.now() - this.lastMessageAt > STALE_AFTER_MS) {
      this.log('warn', `no stream messages for ${Math.round((Date.now() - this.lastMessageAt) / 1000)}s; forcing reconnect`);
      this.teardown();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
    this.attempt++;
    this.reconnects++;
    setTimeout(() => void this.connect(), delay);
  }

  private clearPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private teardown(): void {
    this.clearPing();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
  }
}

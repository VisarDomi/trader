import type { Candle } from '../../core/agent/types.ts';
import type { MinuteCandleHandler, PriceFeed } from '../../core/feed/types.ts';
import type { CapitalSession } from './CapitalSession.ts';

export type TickHandler = (bid: number, ask: number, timestamp: number) => void;

interface CapitalLiveFeedConfig {
  session: CapitalSession;
  epic: string;
  onTick?: TickHandler;
}

const PING_INTERVAL_MS = 60_000;
const RECONNECT_DELAY_MS = 3_000;

/**
 * Live price feed via Capital.com WebSocket.
 *
 * Connects to the streaming API, subscribes to quotes for a single epic,
 * accumulates ticks into minute candles, and emits completed candles
 * when a new minute bucket starts.
 *
 * Also calls onTick for every quote so the runner can check stops/TPs
 * in real-time.
 */
export class CapitalLiveFeed implements PriceFeed {
  private readonly session: CapitalSession;
  private readonly epic: string;
  private readonly onTick?: TickHandler;

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped: boolean = false;
  private resolveStart: (() => void) | null = null;

  // Minute candle accumulation
  private currentBucket: number = 0;  // floor(ts / 60000) * 60000
  private currentCandle: { open: number; high: number; low: number; close: number } | null = null;
  private handler: MinuteCandleHandler | null = null;

  constructor(config: CapitalLiveFeedConfig) {
    this.session = config.session;
    this.epic = config.epic;
    this.onTick = config.onTick;
  }

  async start(handler: MinuteCandleHandler): Promise<void> {
    this.handler = handler;
    this.stopped = false;

    return new Promise<void>((resolve) => {
      this.resolveStart = resolve;
      this.connect();
    });
  }

  stop(): void {
    this.stopped = true;

    // Flush partial candle
    if (this.currentCandle && this.handler) {
      const candle = this.buildCandle(this.currentBucket);
      this.handler(candle);
      this.currentCandle = null;
    }

    this.cleanup();

    if (this.resolveStart) {
      this.resolveStart();
      this.resolveStart = null;
    }
  }

  /**
   * Process a raw tick (bid mid-price). Public for testability.
   */
  processTick(bid: number, ask: number, timestamp: number): void {
    const mid = (bid + ask) / 2;
    const bucket = Math.floor(timestamp / 60_000) * 60_000;

    // Call tick handler for live stop/TP monitoring
    this.onTick?.(bid, ask, timestamp);

    if (this.currentCandle === null) {
      // First tick ever
      this.currentBucket = bucket;
      this.currentCandle = { open: mid, high: mid, low: mid, close: mid };
      return;
    }

    if (bucket !== this.currentBucket) {
      // New minute — emit completed candle
      if (this.handler) {
        const candle = this.buildCandle(this.currentBucket);
        this.handler(candle);
      }

      // Start new accumulation
      this.currentBucket = bucket;
      this.currentCandle = { open: mid, high: mid, low: mid, close: mid };
      return;
    }

    // Same minute — update OHLC
    this.currentCandle.high = Math.max(this.currentCandle.high, mid);
    this.currentCandle.low = Math.min(this.currentCandle.low, mid);
    this.currentCandle.close = mid;
  }

  private buildCandle(bucket: number): Candle {
    const c = this.currentCandle!;
    return {
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      timestamp: bucket,
      timeframe: '1m',
    };
  }

  private connect(): void {
    if (this.stopped) return;

    const { cst, securityToken } = this.session.getTokens();
    const wsUrl = this.session.getWebSocketUrl();

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Subscribe to quotes
      const subscribeMsg = JSON.stringify({
        destination: 'marketData.subscribe',
        correlationId: '1',
        cst,
        securityToken,
        payload: {
          epics: [this.epic],
        },
      });
      this.ws!.send(subscribeMsg);

      // Start ping
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));

        if (data.destination === 'quote') {
          const payload = data.payload;
          const bid = payload?.bid;
          const ofr = payload?.ofr; // "offer" = ask
          if (typeof bid === 'number' && typeof ofr === 'number') {
            this.processTick(bid, ofr, Date.now());
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.stopPing();
      if (!this.stopped) {
        // Reconnect after delay
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      }
    };

    this.ws.onerror = () => {
      // Will trigger onclose → reconnect
    };
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ destination: 'ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private cleanup(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }
  }
}

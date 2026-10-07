/**
 * Capital.com REST client — DEMO ONLY.
 *
 * The base URL is a constant on purpose: this platform never trades real
 * money, so there is no code path that can point it at the live API.
 *
 * Handles: session auth, re-auth on 401, account switching, request pacing,
 * and 429 back-off.
 *
 * Capital.com limits (open-api.capital.com, checked 2026-10-07). They apply per
 * login, so every process using these credentials (arena, lab, position-opener)
 * shares them:
 *   - 10 requests/s per user; opening positions/orders at most 1 per 0.1 s
 *   - POST /session 1 per second per API key; a session expires after 10 min idle
 *   - demo: POST /positions + POST /workingorders 1,000 per hour
 *   - WebSocket: at most 40 instruments per subscription
 */

export const DEMO_BASE_URL = 'https://demo-api-capital.backend-capital.com';
export const STREAM_URL = 'wss://api-streaming-capital.backend-capital.com/connect';

const HEADER_API_KEY = 'X-CAP-API-KEY';
const HEADER_CST = 'CST';
const HEADER_SECURITY = 'X-SECURITY-TOKEN';

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY = 429;
const HTTP_SERVER_ERROR = 500;
/** Requests safe to repeat after a gateway error (an order POST is not: it may have gone through). */
const RETRY_ON_SERVER_ERROR = new Set(['GET']);

/** Default pace for one process (~3 req/s of the login's 10), so other apps on the same login keep working. */
const DEFAULT_MIN_INTERVAL_MS = 300;
/** POST /session is limited to 1 per second per API key. */
const LOGIN_MIN_INTERVAL_MS = 1_100;
const MAX_RETRIES = 5;
/** Session expires after 10 min idle; refresh at 8. */
const SESSION_REFRESH_MS = 8 * 60_000;

export interface CapitalCredentials {
  apiKey: string;
  identifier: string;
  password: string;
}

export function credentialsFromEnv(): CapitalCredentials {
  const apiKey = process.env.CAPITAL_API_KEY;
  const identifier = process.env.CAPITAL_IDENTIFIER;
  const password = process.env.CAPITAL_PASSWORD;
  if (!apiKey || !identifier || !password) {
    throw new Error('Missing CAPITAL_API_KEY / CAPITAL_IDENTIFIER / CAPITAL_PASSWORD');
  }
  return { apiKey, identifier, password };
}

export class CapitalApiError extends Error {
  constructor(readonly status: number, readonly body: string, path: string) {
    // Gateway errors come back as HTML pages; keep only their text.
    super(`Capital.com ${status} on ${path}: ${body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)}`);
  }
}

export interface PriceBar {
  /** Bar open time, ms UTC. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** ask - bid at bar close. */
  spread: number;
  volume: number;
}

interface RawPrice {
  snapshotTimeUTC: string;
  openPrice: { bid: number; ask: number };
  highPrice: { bid: number; ask: number };
  lowPrice: { bid: number; ask: number };
  closePrice: { bid: number; ask: number };
  lastTradedVolume?: number;
}

export const RESOLUTION = {
  MINUTE: 'MINUTE',
  MINUTE_5: 'MINUTE_5',
  MINUTE_15: 'MINUTE_15',
  HOUR: 'HOUR',
  HOUR_4: 'HOUR_4',
  DAY: 'DAY',
} as const;
export type Resolution = (typeof RESOLUTION)[keyof typeof RESOLUTION];

/**
 * Spaces requests at least `minIntervalMs` apart. Clients that share one pacer
 * share one request budget (e.g. the arena's data client and broker client).
 */
export class RequestPacer {
  private nextSlot = 0;

  constructor(readonly minIntervalMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minIntervalMs;
    if (slot > now) await Bun.sleep(slot - now);
  }
}

/** Every client in this process shares the login limit. */
const loginPacer = new RequestPacer(LOGIN_MIN_INTERVAL_MS);

export class CapitalClient {
  private cst = '';
  private securityToken = '';
  private authedAt = 0;
  private accountId: string | null = null;
  private authPromise: Promise<void> | null = null;
  /** Incremented on every successful login, so callers can tell when to re-verify the active account. */
  logins = 0;

  constructor(
    private readonly creds: CapitalCredentials,
    private readonly pacer = new RequestPacer(DEFAULT_MIN_INTERVAL_MS),
  ) {}

  tokens(): { cst: string; securityToken: string } {
    return { cst: this.cst, securityToken: this.securityToken };
  }

  /** Authenticate (and re-select the chosen sub-account, if any). */
  async login(): Promise<void> {
    if (this.authPromise) return this.authPromise;
    this.authPromise = this.doLogin().finally(() => {
      this.authPromise = null;
    });
    return this.authPromise;
  }

  private async doLogin(): Promise<void> {
    await loginPacer.wait();
    await this.pacer.wait();
    const res = await fetch(`${DEMO_BASE_URL}/api/v1/session`, {
      method: 'POST',
      headers: { [HEADER_API_KEY]: this.creds.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: this.creds.identifier, password: this.creds.password }),
    });
    if (!res.ok) throw new CapitalApiError(res.status, await res.text(), '/session');
    this.cst = res.headers.get(HEADER_CST) ?? '';
    this.securityToken = res.headers.get(HEADER_SECURITY) ?? '';
    if (!this.cst || !this.securityToken) throw new Error('Capital.com auth: missing session tokens');
    this.authedAt = Date.now();
    const body = (await res.json()) as { currentAccountId: string };
    if (this.accountId && body.currentAccountId !== this.accountId) {
      await this.switchAccountRaw(this.accountId);
    }
    this.logins++;
  }

  /** Select a sub-account by its display name (e.g. "Gerti"). Session-scoped. */
  async useAccount(accountName: string): Promise<string> {
    const { accounts } = await this.get<{ accounts: { accountId: string; accountName: string }[] }>('/api/v1/accounts');
    const match = accounts.find(a => a.accountName === accountName);
    if (!match) throw new Error(`Capital.com sub-account "${accountName}" not found`);
    await this.selectAccount(match.accountId);
    return match.accountId;
  }

  /**
   * Put this session on `accountId` and verify it with GET /session. The choice
   * survives re-logins. Note: Capital.com also makes it the login's "preferred"
   * account, which is where new logins (web, other apps) start.
   */
  async selectAccount(accountId: string): Promise<void> {
    if (!this.cst) await this.login();
    this.accountId = accountId;
    try {
      await this.switchAccountRaw(accountId);
    } catch (err) {
      if (!(err instanceof CapitalApiError && err.status === HTTP_UNAUTHORIZED)) throw err;
      await this.login(); // re-login switches to this.accountId
    }
    const session = await this.get<{ accountId: string }>('/api/v1/session');
    if (session.accountId !== accountId) {
      throw new Error(`Account switch to ${accountId} did not stick (session on ${session.accountId})`);
    }
  }

  private async switchAccountRaw(accountId: string): Promise<void> {
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      await this.pacer.wait();
      res = await fetch(`${DEMO_BASE_URL}/api/v1/session`, {
        method: 'PUT',
        headers: this.authHeaders(),
        body: JSON.stringify({ accountId }),
      });
      // Switching to the same account twice is harmless, so gateway errors are retried.
      if (res.status < HTTP_SERVER_ERROR || attempt >= MAX_RETRIES) break;
      await res.text();
      await Bun.sleep(1000 * 2 ** attempt);
    }
    // 400 "error.not-different.accountId" means we are already on it.
    if (!res.ok && res.status !== 400) throw new CapitalApiError(res.status, await res.text(), 'PUT /session');
    const cst = res.headers.get(HEADER_CST);
    const sec = res.headers.get(HEADER_SECURITY);
    if (cst && sec) {
      this.cst = cst;
      this.securityToken = sec;
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.cst || Date.now() - this.authedAt > SESSION_REFRESH_MS) await this.login();
    for (let attempt = 0; ; attempt++) {
      await this.pacer.wait();
      const res = await fetch(`${DEMO_BASE_URL}${path}`, {
        method,
        headers: this.authHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) {
        this.authedAt = Date.now();
        const text = await res.text();
        return (text ? JSON.parse(text) : {}) as T;
      }
      const text = await res.text();
      if (attempt >= MAX_RETRIES) throw new CapitalApiError(res.status, text, path);
      if (res.status === HTTP_UNAUTHORIZED) {
        await this.login();
        continue;
      }
      if (res.status === HTTP_TOO_MANY || (res.status >= HTTP_SERVER_ERROR && RETRY_ON_SERVER_ERROR.has(method))) {
        await Bun.sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new CapitalApiError(res.status, text, path);
    }
  }

  /**
   * Price bars between [fromMs, toMs]. Returns [] when Capital.com has no data
   * for the window (weekends, before history start).
   */
  async prices(epic: string, resolution: Resolution, fromMs: number, toMs: number, max = 1000): Promise<PriceBar[]> {
    const params = new URLSearchParams({
      resolution,
      from: isoNoMs(fromMs),
      to: isoNoMs(toMs),
      max: String(max),
    });
    try {
      const data = await this.get<{ prices: RawPrice[] }>(`/api/v1/prices/${epic}?${params}`);
      return (data.prices ?? []).map(toPriceBar);
    } catch (err) {
      if (err instanceof CapitalApiError && (err.status === HTTP_NOT_FOUND || err.body.includes('not-found'))) return [];
      throw err;
    }
  }

  /** True when Capital.com has at least one bar ending at or before `toMs`. */
  async hasDataBefore(epic: string, toMs: number): Promise<boolean> {
    const params = new URLSearchParams({ resolution: RESOLUTION.MINUTE, to: isoNoMs(toMs), max: '1' });
    try {
      const data = await this.get<{ prices: RawPrice[] }>(`/api/v1/prices/${epic}?${params}`);
      return (data.prices ?? []).length > 0;
    } catch (err) {
      if (err instanceof CapitalApiError && err.status === HTTP_NOT_FOUND) return false;
      throw err;
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      [HEADER_API_KEY]: this.creds.apiKey,
      [HEADER_CST]: this.cst,
      [HEADER_SECURITY]: this.securityToken,
      'Content-Type': 'application/json',
    };
  }
}

function toPriceBar(p: RawPrice): PriceBar {
  return {
    time: Date.parse(p.snapshotTimeUTC.replace(/\/$/, '') + 'Z'),
    open: p.openPrice.bid,
    high: p.highPrice.bid,
    low: p.lowPrice.bid,
    close: p.closePrice.bid,
    spread: round(p.closePrice.ask - p.closePrice.bid, 8),
    volume: p.lastTradedVolume ?? 0,
  };
}

function isoNoMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

function round(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

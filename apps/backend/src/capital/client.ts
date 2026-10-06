/**
 * Capital.com REST client — DEMO ONLY.
 *
 * The base URL is a constant on purpose: this platform never trades real
 * money, so there is no code path that can point it at the live API.
 *
 * Handles: session auth, re-auth on 401, account switching, a global request
 * rate limiter, and 429 back-off.
 */

export const DEMO_BASE_URL = 'https://demo-api-capital.backend-capital.com';
export const STREAM_URL = 'wss://api-streaming-capital.backend-capital.com/connect';

const HEADER_API_KEY = 'X-CAP-API-KEY';
const HEADER_CST = 'CST';
const HEADER_SECURITY = 'X-SECURITY-TOKEN';

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY = 429;

/** Capital.com allows 10 req/s per user; stay well below so other apps on the same login keep working. */
const DEFAULT_MIN_INTERVAL_MS = 250;
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
    super(`Capital.com ${status} on ${path}: ${body.slice(0, 300)}`);
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

export class CapitalClient {
  private cst = '';
  private securityToken = '';
  private authedAt = 0;
  private accountId: string | null = null;
  private nextSlot = 0;
  private authPromise: Promise<void> | null = null;

  constructor(
    private readonly creds: CapitalCredentials,
    private readonly minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
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
    await this.throttle();
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
  }

  /** Select a sub-account by its display name (e.g. "Gerti"). Session-scoped. */
  async useAccount(accountName: string): Promise<string> {
    const { accounts } = await this.get<{ accounts: { accountId: string; accountName: string }[] }>('/api/v1/accounts');
    const match = accounts.find(a => a.accountName === accountName);
    if (!match) throw new Error(`Capital.com sub-account "${accountName}" not found`);
    this.accountId = match.accountId;
    await this.switchAccountRaw(match.accountId);
    const session = await this.get<{ accountId: string }>('/api/v1/session');
    if (session.accountId !== match.accountId) {
      throw new Error(`Account switch to ${accountName} did not stick (session on ${session.accountId})`);
    }
    return match.accountId;
  }

  private async switchAccountRaw(accountId: string): Promise<void> {
    await this.throttle();
    const res = await fetch(`${DEMO_BASE_URL}/api/v1/session`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify({ accountId }),
    });
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
      await this.throttle();
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
      if (res.status === HTTP_TOO_MANY) {
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

  private async throttle(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minIntervalMs;
    if (slot > now) await Bun.sleep(slot - now);
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

import type { RealStatus } from '@trader/shared/types';

export interface RealAssignPayload {
  runId: string;
  agentId: string;
  epic: string;
  leverage: number;
  codeHash: string;
  confirmed: boolean;
}

export interface RealRemoteOptions {
  baseUrl: string;
  token: string;
  pollMs?: number;
}

/**
 * PC-side client to the standalone `trader-real` service running on Hetzner.
 * Polls status in the background so `/api/broker` stays fast even if the tunnel blips,
 * while mutating assign/clear calls talk directly to Hetzner and fail loudly if unreachable.
 */
export class RealRemoteClient {
  private cached: RealStatus | null = null;
  private lastError: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: RealRemoteOptions) {}

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.opts.pollMs ?? 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  cachedStatus(): RealStatus {
    if (this.cached) return this.cached;
    return {
      host: 'hetzner',
      reachable: false,
      accountId: '',
      accountName: null,
      currency: 'USD',
      balance: null,
      available: null,
      equity: null,
      leverage: null,
      leverageOk: null,
      assignment: null,
      streamConnected: false,
      ready: false,
      openDeals: 0,
      deals: [],
      lastCycleAt: 0,
      lastError: this.lastError ?? 'Hetzner real service unreachable',
    };
  }

  async refresh(): Promise<RealStatus | null> {
    try {
      const res = await fetch(`${this.opts.baseUrl}/api/real/status`, {
        headers: { Authorization: `Bearer ${this.opts.token}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const st = (await res.json()) as RealStatus;
      this.cached = { ...st, reachable: true };
      this.lastError = null;
      return this.cached;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      if (this.cached) this.cached = { ...this.cached, reachable: false, lastError: this.lastError };
      return null;
    }
  }

  async assign(payload: RealAssignPayload): Promise<RealStatus> {
    const res = await fetch(`${this.opts.baseUrl}/api/real/assign`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: RealStatus; error?: string };
    if (!res.ok || !body.status) {
      throw new Error(body.error ?? `Hetzner real service rejected assignment (HTTP ${res.status})`);
    }
    this.cached = { ...body.status, reachable: true };
    this.lastError = null;
    return this.cached;
  }

  async clear(runId: string, confirmed: boolean): Promise<RealStatus> {
    const res = await fetch(`${this.opts.baseUrl}/api/real/clear`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ runId, confirmed }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: RealStatus; error?: string };
    if (!res.ok || !body.status) {
      throw new Error(body.error ?? `Hetzner real service rejected demotion (HTTP ${res.status})`);
    }
    this.cached = { ...body.status, reachable: true };
    this.lastError = null;
    return this.cached;
  }
}

export interface CapitalCredentials {
  apiKey: string;
  identifier: string;
  password: string;
  isDemo: boolean;
}

const BASE_URLS = {
  demo: 'https://demo-api-capital.backend-capital.com',
  live: 'https://api-capital.backend-capital.com',
} as const;

const WS_URL = 'wss://api-streaming-capital.backend-capital.com/connect';

const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Manages a Capital.com API session.
 *
 * Handles authentication, keep-alive pings, and authenticated HTTP requests.
 * Auto re-authenticates on 401.
 */
export class CapitalSession {
  private readonly credentials: CapitalCredentials;
  private readonly baseUrl: string;
  private cst: string = '';
  private securityToken: string = '';
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private connected: boolean = false;

  constructor(credentials: CapitalCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.isDemo ? BASE_URLS.demo : BASE_URLS.live;
  }

  async connect(): Promise<void> {
    await this.authenticate();
    this.startKeepAlive();
    this.connected = true;
  }

  async destroy(): Promise<void> {
    this.stopKeepAlive();
    if (this.connected && this.cst) {
      try {
        await this.request('DELETE', '/api/v1/session');
      } catch {
        // Best-effort cleanup
      }
    }
    this.cst = '';
    this.securityToken = '';
    this.connected = false;
  }

  getTokens(): { cst: string; securityToken: string } {
    return { cst: this.cst, securityToken: this.securityToken };
  }

  getWebSocketUrl(): string {
    return WS_URL;
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.authenticatedRequest<T>('GET', path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.authenticatedRequest<T>('POST', path, body);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.authenticatedRequest<T>('PUT', path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.authenticatedRequest<T>('DELETE', path);
  }

  private async authenticatedRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.request(method, path, body);

    if (response.status === 401) {
      // Session expired — re-authenticate and retry once
      await this.authenticate();
      const retry = await this.request(method, path, body);
      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(`Capital.com API error ${retry.status}: ${text}`);
      }
      return retry.json() as Promise<T>;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Capital.com API error ${response.status}: ${text}`);
    }

    // DELETE responses may have empty body
    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'X-CAP-API-KEY': this.credentials.apiKey,
      'Content-Type': 'application/json',
    };

    if (this.cst) {
      headers['CST'] = this.cst;
      headers['X-SECURITY-TOKEN'] = this.securityToken;
    }

    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private async authenticate(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/session`, {
      method: 'POST',
      headers: {
        'X-CAP-API-KEY': this.credentials.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: this.credentials.identifier,
        password: this.credentials.password,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Capital.com auth failed (${response.status}): ${text}`);
    }

    const cst = response.headers.get('CST');
    const securityToken = response.headers.get('X-SECURITY-TOKEN');

    if (!cst || !securityToken) {
      throw new Error('Capital.com auth response missing CST or X-SECURITY-TOKEN headers');
    }

    this.cst = cst;
    this.securityToken = securityToken;
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(async () => {
      try {
        await this.request('PUT', '/api/v1/session');
      } catch {
        // Keep-alive failure is non-fatal; next request will re-auth on 401
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}

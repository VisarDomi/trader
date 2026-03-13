import { describe, it, expect, afterAll } from 'bun:test';
import type { Server } from 'bun';
import { RunManager } from '../run/RunManager.ts';
import { createServer } from './server.ts';
import { resolve } from 'path';

// Use the .example agents directory for testing
const AGENTS_DIR = resolve(import.meta.dir, '..', '..', 'agents');

// Use a random port to avoid conflicts
const TEST_PORT = 30000 + Math.floor(Math.random() * 10000);

let server: Server;
let runManager: RunManager;

function setup() {
  if (!server) {
    runManager = new RunManager(AGENTS_DIR);
    server = createServer(runManager, TEST_PORT);
  }
  return { server, runManager };
}

afterAll(() => {
  if (server) server.stop(true);
});

function url(path: string): string {
  setup();
  return `http://localhost:${server.port}${path}`;
}

// ============================================
// HEALTH
// ============================================

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await fetch(url('/health'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeGreaterThan(0);
  });
});

// ============================================
// INSTRUMENTS
// ============================================

describe('GET /instruments', () => {
  it('returns instrument map', async () => {
    const res = await fetch(url('/instruments'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.US100).toBeDefined();
    expect(body.US100.epic).toBe('US100');
    expect(body.US100.leverage).toBe(200);
    expect(body.US100.spread).toBe(1.8);
  });
});

// ============================================
// AGENTS
// ============================================

describe('GET /agents', () => {
  it('returns list of agents from agents/ directory', async () => {
    const res = await fetch(url('/agents'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // The .example/ema-crossover.ts agent should be found
    const ema = body.find((a: { id: string }) => a.id.includes('ema-crossover'));
    expect(ema).toBeDefined();
    expect(ema.config.name).toBe('EMA Crossover');
  });
});

describe('GET /agents/:id', () => {
  it('returns agent details', async () => {
    const res = await fetch(url('/agents/example/ema-crossover'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('example/ema-crossover');
    expect(body.config.instrument).toBe('US100');
  });

  it('returns 404 for unknown agent', async () => {
    const res = await fetch(url('/agents/nonexistent'));
    expect(res.status).toBe(404);
  });
});

// ============================================
// RUNS - validation
// ============================================

describe('POST /runs', () => {
  it('rejects missing required fields', async () => {
    const res = await fetch(url('/runs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing required fields');
  });

  it('rejects backtest without dates', async () => {
    const res = await fetch(url('/runs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'example/ema-crossover',
        capital: 10000,
        mode: 'backtest',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('startDate and endDate');
  });

  it('rejects unknown agent', async () => {
    const res = await fetch(url('/runs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'nonexistent',
        capital: 10000,
        mode: 'backtest',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Agent not found');
  });

  it('returns 400 for paper mode without credentials', async () => {
    const res = await fetch(url('/runs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'example/ema-crossover',
        capital: 10000,
        mode: 'paper',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing Capital.com credentials');
  });
});

// ============================================
// 404
// ============================================

describe('Unknown routes', () => {
  it('returns 404 for unknown paths', async () => {
    const res = await fetch(url('/nonexistent'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  it('returns CORS headers', async () => {
    const res = await fetch(url('/health'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

// ============================================
// RUNS - read endpoints (these hit DB, so they
// will fail without PostgreSQL — mark accordingly)
// ============================================

describe('GET /runs (requires DB)', () => {
  it('endpoint exists and accepts query params', async () => {
    // This will fail at DB level, but tests the routing
    const res = await fetch(url('/runs?mode=backtest&status=completed'));
    // Either 200 (DB available) or 500 (DB not available) — but not 404
    expect(res.status).not.toBe(404);
  });
});

describe('GET /runs/:id/fills (requires DB)', () => {
  it('endpoint exists', async () => {
    const res = await fetch(url('/runs/test-run/fills'));
    expect(res.status).not.toBe(404);
  });
});

describe('GET /runs/:id/equity-curve (requires DB)', () => {
  it('endpoint exists', async () => {
    const res = await fetch(url('/runs/test-run/equity-curve'));
    expect(res.status).not.toBe(404);
  });
});

describe('GET /leaderboard (requires DB)', () => {
  it('endpoint exists', async () => {
    const res = await fetch(url('/leaderboard?sortBy=totalReturn'));
    expect(res.status).not.toBe(404);
  });
});

// ============================================
// WebSocket
// ============================================

describe('WebSocket /ws/runs/:id', () => {
  it('connects and receives connected message', async () => {
    setup();
    const ws = new WebSocket(`ws://localhost:${server.port}/ws/runs/test-run`);

    const message = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (e) => resolve(e.data as string);
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    const parsed = JSON.parse(message);
    expect(parsed.type).toBe('connected');
    expect(parsed.runId).toBe('test-run');
    ws.close();
  });
});

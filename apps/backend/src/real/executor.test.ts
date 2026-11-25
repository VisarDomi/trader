import { describe, expect, test } from 'bun:test';
import { getInstrument } from '../engine/instruments.ts';
import type { CapitalClient } from '../capital/client.ts';
import { RealDB } from './db.ts';
import { RealExecutor } from './executor.ts';
import { realOrderSize } from './sizing.ts';

const USD_ID = '271895451588973764';
const EUR_ID = '163234561411536210';

function mockLiveClient(opts?: { usdBalance?: number; usdAvailable?: number; indicesLeverage?: number }) {
  const balance = opts?.usdBalance ?? 1.0;
  const available = opts?.usdAvailable ?? balance;
  let indicesLev = opts?.indicesLeverage ?? 200;
  const selected: string[] = [];
  const positions: { position: { dealId: string; direction: string; size: number; level: number }; market: { epic: string; bid: number; offer: number } }[] = [];
  const orders: unknown[] = [];
  const closed: string[] = [];
  let seq = 0;

  const client = {
    logins: 1,
    async selectAccount(id: string) {
      selected.push(id);
    },
    async get(path: string) {
      if (path === '/api/v1/accounts') {
        return {
          accounts: [
            { accountId: EUR_ID, accountName: 'Real Euro', currency: 'EUR', status: 'ENABLED', balance: { balance: 0.01, deposit: 0.01, profitLoss: 0, available: 0.01 } },
            { accountId: USD_ID, accountName: 'Real USD', currency: 'USD', status: 'ENABLED', balance: { balance, deposit: balance, profitLoss: 0, available } },
          ],
        };
      }
      if (path === '/api/v1/accounts/preferences') {
        return {
          hedgingMode: false,
          leverages: { INDICES: { current: indicesLev, available: [1, 20, 50, 100, 200] } },
        };
      }
      if (path === '/api/v1/positions') return { positions };
      if (path.startsWith('/api/v1/confirms/')) {
        const ref = path.split('/').pop()!;
        const last = orders.at(-1) as { epic: string; direction: string; size: number } | undefined;
        if (ref.startsWith('close-')) {
          const dealId = ref.replace('close-', '');
          return { dealStatus: 'ACCEPTED', epic: 'US500', direction: 'SELL', size: last?.size ?? 0.01, dealId, level: 7100, profit: 0.1 };
        }
        const dealId = `REAL-${++seq}`;
        positions.push({ position: { dealId, direction: last!.direction, size: last!.size, level: 7090 }, market: { epic: last!.epic, bid: 7089.5, offer: 7090 } });
        return { dealStatus: 'ACCEPTED', epic: last!.epic, direction: last!.direction, size: last!.size, dealId, level: 7090 };
      }
      throw new Error(`unexpected GET ${path}`);
    },
    async post(path: string, body: unknown) {
      if (path === '/api/v1/positions') {
        orders.push(body);
        return { dealReference: `open-${orders.length}` };
      }
      throw new Error(`unexpected POST ${path}`);
    },
    async put(path: string, body: { leverages?: Record<string, number> }) {
      if (path === '/api/v1/accounts/preferences' && body.leverages?.INDICES) {
        indicesLev = body.leverages.INDICES;
        return {};
      }
      return {};
    },
    async delete(path: string) {
      const dealId = path.split('/').pop()!;
      closed.push(dealId);
      const idx = positions.findIndex(p => p.position.dealId === dealId);
      if (idx >= 0) positions.splice(idx, 1);
      return { dealReference: `close-${dealId}` };
    },
  } as unknown as CapitalClient;

  return { client, selected, orders, closed, positions };
}

describe('RealExecutor (Hetzner single-agent USD lock)', () => {
  test('realOrderSize scales proportionally, allows minSize when affordable, and blocks when margin is insufficient', () => {
    const us500 = getInstrument('US500');
    // $0.23 available cannot cover 0.01 US500 @ 7090 (1:200 => ~$0.3545 margin).
    const tooSmall = realOrderSize(us500, 60, 10_000, 0.23, 0.23, 7090, 200);
    expect(tooSmall.size).toBeNull();
    expect(tooSmall.reason).toContain('insufficient Real USD margin');

    // $0.50 available covers 0.01 minimum (~$0.3545 margin) even though proportional (0.003) < 0.01.
    const smallOk = realOrderSize(us500, 60, 10_000, 0.5, 0.5, 7090, 200);
    expect(smallOk.size).toBe(0.01);

    // $100 real equity scales proportionally: 60 * (100/10000) = 0.60 units.
    const scaled = realOrderSize(us500, 60, 10_000, 100, 100, 7090, 200);
    expect(scaled.size).toBe(0.6);
  });

  test('locks strictly to the Real USD account, ignores Real Euro, and enforces single-agent control', async () => {
    const { client, selected, orders, closed } = mockLiveClient({ usdBalance: 1.0, usdAvailable: 1.0 });
    const db = new RealDB(':memory:');
    const ex = new RealExecutor(client, db, { accountId: USD_ID, live: false });
    await ex.start();

    expect(selected).toEqual([USD_ID]);
    expect(ex.status().accountName).toBe('Real USD');
    expect(ex.status().currency).toBe('USD');

    // Requires confirmation.
    await expect(
      ex.assign({ runId: 'demo:visar-night/full-day-200:US500:x200:h1', agentId: 'visar-night/full-day-200', epic: 'US500', leverage: 200 }, false),
    ).rejects.toThrow(/Confirmation required/);

    // Assign first agent.
    const assigned = await ex.assign(
      { runId: 'demo:visar-night/full-day-200:US500:x200:h1', agentId: 'visar-night/full-day-200', epic: 'US500', leverage: 200 },
      true,
    );
    expect(assigned.assignment?.runId).toBe('demo:visar-night/full-day-200:US500:x200:h1');

    // Second different agent is blocked until first is demoted.
    await expect(
      ex.assign({ runId: 'demo:random-baseline:US500:x200:h2', agentId: 'random-baseline', epic: 'US500', leverage: 200 }, true),
    ).rejects.toThrow(/already controlled by/);

    // Open a live order via strategy event.
    await ex.handleRunEvent({
      type: 'order',
      kind: 'open',
      runId: 'demo:visar-night/full-day-200:US500:x200:h1',
      side: 'long',
      size: 60,
      price: 7090,
      time: Date.now(),
      stopLoss: 7070,
      takeProfit: null,
    });
    expect(orders).toHaveLength(1);
    expect(ex.status().openDeals).toBe(1);

    // Demote closes open live deal and frees the account.
    await expect(ex.clear('demo:visar-night/full-day-200:US500:x200:h1', false)).rejects.toThrow(/Confirmation required/);
    const cleared = await ex.clear('demo:visar-night/full-day-200:US500:x200:h1', true);
    expect(cleared.assignment).toBeNull();
    expect(closed).toEqual(['REAL-1']);
    expect(cleared.openDeals).toBe(0);

    // Now another agent can be promoted.
    const next = await ex.assign(
      { runId: 'demo:visar-night/midday-200:US100:x200:h3', agentId: 'visar-night/midday-200', epic: 'US100', leverage: 200 },
      true,
    );
    expect(next.assignment?.runId).toBe('demo:visar-night/midday-200:US100:x200:h3');
    db.close();
  });

  test('refuses to start if locked account is EUR instead of USD', async () => {
    const { client } = mockLiveClient();
    const db = new RealDB(':memory:');
    const ex = new RealExecutor(client, db, { accountId: EUR_ID, expectedCurrency: 'USD', live: false });
    await expect(ex.start()).rejects.toThrow(/expected USD/);
    db.close();
  });
});

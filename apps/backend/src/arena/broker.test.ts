import { expect, test } from 'bun:test';
import { BrokerMirror, BROKER_SETTINGS, type MirrorCandidate } from './broker.ts';
import { ArenaDB } from './db.ts';
import type { CapitalClient } from '../capital/client.ts';
const RUN = 'demo:fixture:EURUSD:x1:hash';
const EPIC = 'EURUSD';
const ACCOUNT = 'arena-owned';
const NAME = 'Arena 01';
const CLOSED = 'REJECTED';
const LONG = 'long';

test('an unrelated rejection confirmation stays uncertain instead of becoming a retryable failed order', async () => {
  const db = new ArenaDB(':memory:');
  db.setSetting(BROKER_SETTINGS.ENABLED, true);
  db.setSetting(BROKER_SETTINGS.RUN_ACCOUNTS, { [RUN]: ACCOUNT });
  db.setSetting(BROKER_SETTINGS.ACCOUNTS, { [ACCOUNT]: { name: NAME, allocation: 100000, killed: false, hedging: true, leverage: 1 } });
  let posts = 0;
  const client = { historyTransactions: async () => ({ transactions: [], complete: true }), logins: 1, selectAccount: async () => {},
    get: async (path: string) => {
      if (path === '/api/v1/accounts') return { accounts: [{ accountId: ACCOUNT, accountName: NAME, balance: { balance: 100000, deposit: 100000, profitLoss: 0 } }] };
      if (path === '/api/v1/accounts/preferences') return { hedgingMode: true, leverages: {} };
      if (path.startsWith('/api/v1/history/')) return { transactions: [] };
      if (path.startsWith('/api/v1/confirms/')) return { dealStatus: CLOSED, epic: 'AUDUSD', direction: 'BUY', size: 100 };
      return { positions: [] };
    },
    post: async () => { posts++; return { dealReference: 'new-order' }; },
  } as unknown as CapitalClient;
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: LONG,
    entry: { size: 500, price: 1.12, time: now, stopLoss: null, takeProfit: null } };
  const mirror = new BrokerMirror(client, db, { prefix: 'Arena', accountTiers: { [NAME]: 1 } });
  mirror.setCandidateSource(() => [candidate]);
  try {
    await mirror.start();
    mirror.onRunEvent({ type: 'open', runId: RUN, side: LONG, size: 500, price: 1.12, time: now, stopLoss: null, takeProfit: null });
    for (let i = 0; i < 200 && !db.dealsForRun(RUN)[0]?.note?.includes('unconfirmed'); i++) await Bun.sleep(10);
    expect(posts).toBe(1);
    expect(db.openDeals()).toHaveLength(1);
    expect(db.openDeals()[0]!.deal_id).toBeNull();
    expect(db.openDeals()[0]!.note).toContain('unconfirmed');
  } finally { mirror.stop(); db.db.close(); }
});

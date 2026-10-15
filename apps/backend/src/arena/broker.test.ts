import { expect, test } from 'bun:test';
import { BrokerMirror, BROKER_SETTINGS, type MirrorCandidate } from './broker.ts';
import { ArenaDB, DEAL_STATUS } from './db.ts';
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

test('Capital hourly request budget survives a process restart', () => {
  const db = new ArenaDB(':memory:');
  for (let i = 0; i < 12; i++) db.insertDeal({ account: NAME, account_id: ACCOUNT, run_id: RUN, epic: EPIC, side: LONG,
    size: 100, paper_size: 500, deal_id: null, status: 'failed', open_time: Date.now() - i * 1000, open_price: null,
    paper_open_price: 1.12, close_time: null, close_price: null, paper_close_price: null, pnl: null, note: 'rejected' });
  const restarted = new BrokerMirror({} as CapitalClient, db, { prefix: 'Arena', accountTiers: { [NAME]: 1 } });
  expect(restarted.status().opensLastHour).toBe(12);
  restarted.stop(); db.db.close();
});

/** No network: an owned, already-configured demo account and an inert Capital client. */
function fixture(candidates: MirrorCandidate[], current: Record<string, string>, postDelayMs = 0) {
  const db = new ArenaDB(':memory:');
  db.setSetting(BROKER_SETTINGS.ENABLED, true);
  db.setSetting(BROKER_SETTINGS.RUN_ACCOUNTS, current);
  db.setSetting(BROKER_SETTINGS.ACCOUNTS, { [ACCOUNT]: { name: NAME, allocation: 100000, hedging: true, leverage: 1, killed: false } });
  let posts = 0;
  let deletes = 0;
  const client = {
    transactions: async () => ({ transactions: [], complete: true }), logins: 1, selectAccount: async () => {},
    get: async (path: string) => {
      if (path === '/api/v1/accounts') return { accounts: [{ accountId: ACCOUNT, accountName: NAME, balance: { balance: 100000, deposit: 100000, profitLoss: 0 } }] };
      if (path === '/api/v1/accounts/preferences') return { hedgingMode: true, leverages: {} };
      if (path.startsWith('/api/v1/confirms/')) return { dealStatus: 'ACCEPTED', epic: EPIC, direction: 'BUY', size: 100, dealId: 'ours', level: 1.12 };
      return { positions: [] };
    },
    post: async (_path: string, _body: unknown, hooks?: { sent?: () => void }) => {
      if (postDelayMs) await Bun.sleep(postDelayMs);
      hooks?.sent?.();
      posts++;
      return { dealReference: 'fixture' };
    },
    delete: async () => { deletes++; return { dealReference: 'fixture' }; },
  } as unknown as CapitalClient;
  const mirror = new BrokerMirror(client, db, { prefix: 'Arena', accountTiers: { [NAME]: 1 } });
  mirror.setCandidateSource(() => candidates);
  return { db, mirror, counts: () => ({ posts, deletes }) };
}

async function settled(mirror: BrokerMirror): Promise<void> {
  for (let i = 0; i < 200 && mirror.status().queued; i++) await Bun.sleep(10);
  // The active job is removed from the queue before its awaited API work finishes.
  await Bun.sleep(30);
}

test('an explicit demo experiment takes a full account slot while an ordinary unproven run waits', async () => {
  const incumbents = Array.from({ length: 50 }, (_, i): MirrorCandidate => ({
    runId: `demo:incumbent-${i}:${EPIC}:x1:hash`, epic: EPIC, tier: 1, score: 0, side: null, entry: null,
  }));
  const special: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: -1_000_000, side: null, entry: null, eligible: true, specialAdmission: true };
  const ordinary: MirrorCandidate = { ...special, runId: `demo:ordinary:${EPIC}:x1:hash`, eligible: false, specialAdmission: false };
  const { db, mirror } = fixture([...incumbents, ordinary, special], Object.fromEntries(incumbents.map(c => [c.runId, ACCOUNT])));
  try {
    await mirror.start();
    await settled(mirror);
    expect(mirror.mirroredRuns).toHaveLength(50);
    expect(mirror.mirroredRuns).toContain(RUN);
    expect(mirror.mirroredRuns).not.toContain(ordinary.runId);
  } finally { mirror.stop(); db.db.close(); }
});

test('the Capital mirror discards an expired timed entry before sending an order', async () => {
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: LONG,
    entry: { size: 500, price: 1.12, time: now, stopLoss: null, takeProfit: null, validUntil: now - 1 } };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT });
  try {
    await mirror.start();
    await settled(mirror);
    mirror.onRunEvent({ type: 'open', runId: RUN, side: LONG, size: 500, price: 1.12, time: now, stopLoss: null, takeProfit: null });
    await settled(mirror);
    expect(counts().posts).toBe(0);
    expect(db.dealsForRun(RUN)).toHaveLength(0);
  } finally { mirror.stop(); db.db.close(); }
});

test('the Capital clock requests the scheduled close without a quote or a new bar', async () => {
  const now = Date.now();
  const deadline = now + 1000;
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: LONG,
    entry: { size: 500, price: 1.12, time: now, stopLoss: null, takeProfit: null, closeAt: deadline } };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT });
  try {
    await mirror.start();
    await settled(mirror);
    db.insertDeal({ account: NAME, account_id: ACCOUNT, run_id: RUN, epic: EPIC, side: LONG,
      size: 100, paper_size: 500, deal_id: 'ours', status: DEAL_STATUS.OPEN, open_time: now, open_price: 1.12,
      paper_open_price: 1.12, close_time: null, close_price: null, paper_close_price: null, pnl: null, note: null });
    mirror.onClock(deadline - 1);
    expect(counts().deletes).toBe(0);
    mirror.onClock(deadline);
    mirror.onClock(deadline + 1);
    for (let i = 0; i < 100 && db.openDeals().length; i++) await Bun.sleep(10);
    expect(counts().deletes).toBe(1);
    expect(db.openDeals()).toHaveLength(0);
  } finally { mirror.stop(); db.db.close(); }
});

test('a timed entry expiring in the HTTP pacer is never sent and is not left uncertain', async () => {
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: LONG,
    entry: { size: 500, price: 1.12, time: now, stopLoss: null, takeProfit: null } };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT }, 60);
  try {
    await mirror.start();
    await settled(mirror);
    candidate.entry!.validUntil = Date.now() + 20;
    mirror.onRunEvent({ type: 'open', runId: RUN, side: LONG, size: 500, price: 1.12, time: now, stopLoss: null, takeProfit: null });
    for (let i = 0; i < 200 && db.dealsForRun(RUN)[0]?.status !== DEAL_STATUS.FAILED; i++) await Bun.sleep(10);
    expect(counts().posts).toBe(0);
    expect(db.dealsForRun(RUN)[0]?.status).toBe(DEAL_STATUS.FAILED);
    expect(db.dealsForRun(RUN)[0]?.note).toContain('expired before submission');
    expect(db.openDeals()).toHaveLength(0);
  } finally { mirror.stop(); db.db.close(); }
});

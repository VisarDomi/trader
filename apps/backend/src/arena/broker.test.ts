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
  // Like Capital.com: a confirmation carries the order's direction, so closing this long confirms as SELL.
  let lastOrder: 'BUY' | 'SELL' = 'BUY';
  const client = {
    transactions: async () => ({ transactions: [], complete: true }), logins: 1, selectAccount: async () => {},
    get: async (path: string) => {
      if (path === '/api/v1/accounts') return { accounts: [{ accountId: ACCOUNT, accountName: NAME, balance: { balance: 100000, deposit: 100000, profitLoss: 0 } }] };
      if (path === '/api/v1/accounts/preferences') return { hedgingMode: true, leverages: {} };
      if (path.startsWith('/api/v1/confirms/')) return { dealStatus: 'ACCEPTED', epic: EPIC, direction: lastOrder, size: 100, dealId: 'ours', level: 1.12 };
      return { positions: [] };
    },
    post: async (_path: string, _body: unknown, hooks?: { sent?: () => void }) => {
      if (postDelayMs) await Bun.sleep(postDelayMs);
      hooks?.sent?.();
      posts++;
      lastOrder = 'BUY';
      return { dealReference: 'fixture' };
    },
    delete: async () => { deletes++; lastOrder = 'SELL'; return { dealReference: 'fixture' }; },
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

test('queued broker opens use rebased profit protection and resync changes that preceded confirmation',async()=>{
 const db=new ArenaDB(':memory:'),now=Date.now(),posts:any[]=[],puts:any[]=[];
 db.setSetting(BROKER_SETTINGS.ENABLED,true);db.setSetting(BROKER_SETTINGS.RUN_ACCOUNTS,{[RUN]:ACCOUNT});
 db.setSetting(BROKER_SETTINGS.ACCOUNTS,{[ACCOUNT]:{name:NAME,allocation:100000,hedging:true,leverage:1,killed:false}});
 const entry={size:500,price:1.12,time:now,stopLoss:1.10,takeProfit:1.20,trailingStop:null};
 const candidate:MirrorCandidate={runId:RUN,epic:EPIC,tier:1,score:0,side:LONG,entry};
 const client={logins:1,selectAccount:async()=>{},historyTransactions:async()=>({transactions:[],complete:true}),
  get:async(path:string)=>{
   if(path==='/api/v1/accounts')return{accounts:[{accountId:ACCOUNT,accountName:NAME,balance:{balance:100000,deposit:100000,profitLoss:0}}]};
   if(path==='/api/v1/accounts/preferences')return{hedgingMode:true,leverages:{}};
   if(path.startsWith('/api/v1/confirms/'))return{dealStatus:'ACCEPTED',epic:EPIC,direction:'BUY',size:100,dealId:'ours',level:1.12};
   if(path==='/api/v1/positions/ours')return{position:{dealId:'ours',direction:'BUY',size:100,createdDateUTC:new Date(now).toISOString().replace('Z','')},market:{epic:EPIC}};
   return{positions:[]};
  },post:async(_path:string,body:any)=>{posts.push(body);entry.takeProfit=1.23;entry.stopLoss=1.09;return{dealReference:'new'}},
  put:async(path:string,body:any)=>{puts.push({path,body})}
 } as unknown as CapitalClient;
 const mirror=new BrokerMirror(client,db,{prefix:'Arena',accountTiers:{[NAME]:1}});mirror.setCandidateSource(()=>[candidate]);
 try{
  await mirror.start();await settled(mirror);
  if(!posts.length)mirror.onRunEvent({type:'open',runId:RUN,side:LONG,size:500,price:1.12,time:now,stopLoss:1.11,takeProfit:1.19});
  for(let i=0;i<200&&!puts.length;i++)await Bun.sleep(10);
  expect(posts[0]).toMatchObject({stopLevel:1.10,profitLevel:1.20,size:100});
  expect(puts).toContainEqual({path:'/api/v1/positions/ours',body:{trailingStop:false,stopLevel:1.09,profitLevel:1.23}});
 }finally{mirror.stop();db.db.close()}
});

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
    // Closed by its own confirmation, so the exit price is recorded.
    expect(db.dealsForRun(RUN).find(d => d.deal_id === 'ours')?.close_price).toBe(1.12);
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

test('a decided paper order reaches Capital at the decision; its later paper fill is linked, not sent again', async () => {
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: null, entry: null, pendingOpen: { side: LONG, at: now } };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT });
  try {
    await mirror.start();
    await settled(mirror);
    mirror.onRunEvent({ type: 'order', kind: 'open', runId: RUN, time: now, side: LONG, size: 500, price: 1.1201, stopLoss: null, takeProfit: null });
    await orderDone(db);
    expect(counts().posts).toBe(1);
    const sent = db.dealsForRun(RUN)[0]!;
    expect(sent).toMatchObject({ decision_time: now, virtual_fill_time: null, paper_open_price: 1.1201 });
    // The paper position fills seconds later, on the first quote stamped after the order's due time.
    candidate.pendingOpen = null; candidate.side = LONG;
    candidate.entry = { size: 500, price: 1.1203, time: now + 8_500, stopLoss: null, takeProfit: null };
    mirror.onRunEvent({ type: 'open', runId: RUN, side: LONG, size: 500, price: 1.1203, time: now + 8_500, decisionTime: now, stopLoss: null, takeProfit: null });
    await settled(mirror);
    expect(counts().posts).toBe(1);
    expect(db.dealsForRun(RUN)).toHaveLength(1);
    expect(db.dealsForRun(RUN)[0]).toMatchObject({ virtual_fill_time: now + 8_500, paper_open_price: 1.1203 });
  } finally { mirror.stop(); db.db.close(); }
});

test('a decided order the paper run no longer holds is never sent', async () => {
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: null, entry: null, pendingOpen: null };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT });
  try {
    await mirror.start();
    await settled(mirror);
    mirror.onRunEvent({ type: 'order', kind: 'open', runId: RUN, time: now, side: LONG, size: 500, price: 1.12, stopLoss: null, takeProfit: null });
    await settled(mirror);
    expect(counts().posts).toBe(0);
    expect(db.dealsForRun(RUN)).toHaveLength(0);
  } finally { mirror.stop(); db.db.close(); }
});

test('a decided close reaches Capital at the decision, before the paper close fills', async () => {
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: LONG,
    entry: { size: 500, price: 1.12, time: now - 60_000, stopLoss: null, takeProfit: null } };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT });
  try {
    await mirror.start();
    await settled(mirror);
    db.insertDeal({ account: NAME, account_id: ACCOUNT, run_id: RUN, epic: EPIC, side: LONG, size: 100, paper_size: 500, deal_id: 'ours',
      status: DEAL_STATUS.OPEN, open_time: now - 60_000, open_price: 1.12, paper_open_price: 1.12, close_time: null, close_price: null,
      paper_close_price: null, pnl: null, note: null });
    mirror.onRunEvent({ type: 'order', kind: 'close', runId: RUN, time: now, side: LONG, reason: 'signal' });
    for (let i = 0; i < 100 && db.openDeals().length; i++) await Bun.sleep(10);
    expect(counts().deletes).toBe(1);
    expect(db.dealsForRun(RUN)[0]?.note).toBe('paper signal decided');
  } finally { mirror.stop(); db.db.close(); }
});

test('the minute sync keeps a decided demo deal while its paper order is still on its way', async () => {
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: null, entry: null, pendingOpen: { side: LONG, at: now } };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT });
  try {
    db.insertDeal({ account: NAME, account_id: ACCOUNT, run_id: RUN, epic: EPIC, side: LONG, size: 100, paper_size: 500, deal_id: 'ours',
      status: DEAL_STATUS.OPEN, open_time: now, open_price: 1.12, paper_open_price: 1.12, close_time: null, close_price: null,
      paper_close_price: null, pnl: null, note: null });
    db.updateDeal(db.dealsForRun(RUN)[0]!.id, { decision_time: now });
    await mirror.start(); // runs a cycle, including the paper sync
    await settled(mirror);
    (mirror as unknown as { syncWithPaper(): void }).syncWithPaper();
    await settled(mirror);
    expect(counts().deletes).toBe(0);
    expect(db.openDeals()).toHaveLength(1);
    // Without the pending order the run is flat and the deal is closed.
    candidate.pendingOpen = null;
    (mirror as unknown as { syncWithPaper(): void }).syncWithPaper();
    for (let i = 0; i < 100 && db.openDeals().length; i++) await Bun.sleep(10);
    expect(counts().deletes).toBe(1);
    await settled(mirror);
  } finally { mirror.stop(); db.db.close(); }
});

test('a paper fill whose decided deal was already closed opens a new demo deal', async () => {
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: LONG,
    entry: { size: 500, price: 1.12, time: now + 9_000, stopLoss: null, takeProfit: null } };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT });
  try {
    await mirror.start();
    await settled(mirror);
    db.insertDeal({ account: NAME, account_id: ACCOUNT, run_id: RUN, epic: EPIC, side: LONG, size: 100, paper_size: 500, deal_id: 'old',
      status: DEAL_STATUS.CLOSED, open_time: now, open_price: 1.12, paper_open_price: 1.12, close_time: now + 1000, close_price: 1.12,
      paper_close_price: null, pnl: 0, note: 'closed at broker (stop/TP or manual)' });
    db.updateDeal(db.dealsForRun(RUN)[0]!.id, { decision_time: now });
    mirror.onRunEvent({ type: 'open', runId: RUN, side: LONG, size: 500, price: 1.12, time: now + 9_000, decisionTime: now, stopLoss: null, takeProfit: null });
    await orderDone(db, 2);
    expect(counts().posts).toBe(1);
    expect(db.dealsForRun(RUN)).toHaveLength(2);
  } finally { mirror.stop(); db.db.close(); }
});

test('in a reversal the paper close of the old side leaves the new side\'s decided deal open', async () => {
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: LONG,
    entry: { size: 500, price: 1.12, time: now + 3_000, stopLoss: null, takeProfit: null } };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT });
  try {
    await mirror.start();
    await settled(mirror);
    // The long left at the decision (the old short was closed then too); the paper reversal fills 3 s later.
    db.insertDeal({ account: NAME, account_id: ACCOUNT, run_id: RUN, epic: EPIC, side: LONG, size: 100, paper_size: 500, deal_id: 'ours',
      status: DEAL_STATUS.OPEN, open_time: now, open_price: 1.12, paper_open_price: 1.12, close_time: null, close_price: null,
      paper_close_price: null, pnl: null, note: null });
    db.updateDeal(db.dealsForRun(RUN)[0]!.id, { decision_time: now });
    mirror.onRunEvent({ type: 'close', runId: RUN, trade: { side: 'short', size: 500, entryTime: now - 60_000, entryPrice: 1.121,
      exitTime: now + 3_000, exitPrice: 1.12, pnl: 0.5, funding: 0, exitReason: 'reverse', barsHeld: 1 } });
    mirror.onRunEvent({ type: 'open', runId: RUN, side: LONG, size: 500, price: 1.12, time: now + 3_000, decisionTime: now, stopLoss: null, takeProfit: null });
    await settled(mirror);
    expect(counts()).toEqual({ posts: 0, deletes: 0 });
    expect(db.openDeals()).toHaveLength(1);
    expect(db.dealsForRun(RUN)[0]).toMatchObject({ status: DEAL_STATUS.OPEN, virtual_fill_time: now + 3_000 });
  } finally { mirror.stop(); db.db.close(); }
});

test('an account\'s next order goes before the previous order\'s position check; a mismatch goes back to reconcile', async () => {
  const now = Date.now(), RUN_B = 'demo:fixture-b:EURUSD:x1:hash', calls: string[] = [];
  const db = new ArenaDB(':memory:');
  db.setSetting(BROKER_SETTINGS.ENABLED, true);
  db.setSetting(BROKER_SETTINGS.RUN_ACCOUNTS, { [RUN]: ACCOUNT, [RUN_B]: ACCOUNT });
  db.setSetting(BROKER_SETTINGS.ACCOUNTS, { [ACCOUNT]: { name: NAME, allocation: 100000, hedging: true, leverage: 1, killed: false } });
  const candidates: MirrorCandidate[] = [RUN, RUN_B].map(runId => ({ runId, epic: EPIC, tier: 1, score: 0, side: null, entry: null, pendingOpen: { side: LONG, at: now } }));
  let n = 0;
  const client = {
    logins: 1, selectAccount: async () => {}, transactions: async () => ({ transactions: [], complete: true }),
    get: async (path: string) => {
      if (path === '/api/v1/accounts') return { accounts: [{ accountId: ACCOUNT, accountName: NAME, balance: { balance: 100000, deposit: 100000, profitLoss: 0 } }] };
      if (path === '/api/v1/accounts/preferences') return { hedgingMode: true, leverages: {} };
      if (path.startsWith('/api/v1/confirms/')) {
        calls.push(`confirm ${path.slice(17)}`);
        return { dealStatus: 'ACCEPTED', epic: EPIC, direction: 'BUY', size: 100, dealId: `deal${path.slice(-1)}`, level: 1.12 };
      }
      if (path.startsWith('/api/v1/positions/deal')) {
        const id = path.slice(18);
        calls.push(`check ${id}`);
        // The second position turns out to be a SELL: the confirmation was not this order's.
        return { position: { dealId: id, direction: id === 'deal2' ? 'SELL' : 'BUY', size: 100, createdDateUTC: new Date().toISOString().replace('Z', '') }, market: { epic: EPIC } };
      }
      return { positions: [] };
    },
    post: async (_path: string, _body: unknown, hooks?: { sent?: () => void; accepted?: () => void }) => {
      hooks?.sent?.();
      calls.push(`post ${++n}`);
      hooks?.accepted?.();
      return { dealReference: `ref${n}` };
    },
  } as unknown as CapitalClient;
  const mirror = new BrokerMirror(client, db, { prefix: 'Arena', accountTiers: { [NAME]: 1 } });
  mirror.setCandidateSource(() => candidates);
  try {
    await mirror.start();
    await settled(mirror);
    for (const runId of [RUN, RUN_B])
      mirror.onRunEvent({ type: 'order', kind: 'open', runId, time: now, side: LONG, size: 500, price: 1.12, stopLoss: null, takeProfit: null });
    for (let i = 0; i < 300 && calls.filter(c => c.startsWith('check')).length < 2; i++) await Bun.sleep(10);
    await settled(mirror);
    expect(calls).toEqual(['post 1', 'confirm ref1', 'post 2', 'confirm ref2', 'check deal1', 'check deal2']);
    expect(db.dealsForRun(RUN)[0]).toMatchObject({ deal_id: 'deal1', open_price: 1.12, note: null });
    expect(db.dealsForRun(RUN_B)[0]).toMatchObject({ deal_id: null, open_price: null, confirmed_time: null, note: 'unconfirmed: confirmed position does not match the request' });
  } finally { mirror.stop(); db.db.close(); }
});

test('a decided order sent after its paper fill is that fill\'s deal; the fill does not try a second open', async () => {
  const now = Date.now();
  const candidate: MirrorCandidate = { runId: RUN, epic: EPIC, tier: 1, score: 0, side: LONG,
    entry: { size: 500, price: 1.1203, time: now + 2_500, stopLoss: null, takeProfit: null } };
  const { db, mirror, counts } = fixture([candidate], { [RUN]: ACCOUNT });
  try {
    await mirror.start();
    await settled(mirror);
    // The account's queue held the decided order until after the paper fill; both reach the queue in that order.
    mirror.onRunEvent({ type: 'order', kind: 'open', runId: RUN, time: now, side: LONG, size: 500, price: 1.1201, stopLoss: null, takeProfit: null });
    mirror.onRunEvent({ type: 'open', runId: RUN, side: LONG, size: 500, price: 1.1203, time: now + 2_500, decisionTime: now, stopLoss: null, takeProfit: null });
    await orderDone(db);
    await settled(mirror);
    expect(counts().posts).toBe(1);
    expect(db.dealsForRun(RUN)).toHaveLength(1);
    expect(db.dealsForRun(RUN)[0]).toMatchObject({ decision_time: now, virtual_fill_time: now + 2_500 });
    expect(db.events(50).filter(e => e.message.includes('previous deal is still open'))).toHaveLength(0);
  } finally { mirror.stop(); db.db.close(); }
});

/** The newest deal's order job has finished: confirmed, or left unconfirmed (the fixture has no position lookup). */
async function orderDone(db: ArenaDB, deals = 1): Promise<void> {
  for (let i = 0; i < 300; i++) {
    const all = db.dealsForRun(RUN), d = all.at(-1);
    if (all.length >= deals && d && (d.deal_id || d.note || d.status !== DEAL_STATUS.OPEN)) break;
    await Bun.sleep(10);
  }
  await Bun.sleep(30);
}

test('with a session per account, accounts work in parallel and an order goes before that account\'s reconciliation', async () => {
  const OTHER = 'arena-two', OTHER_NAME = 'Arena 02', RUN2 = 'demo:fixture:EURUSD:x2:hash';
  const db = new ArenaDB(':memory:');
  db.setSetting(BROKER_SETTINGS.ENABLED, true);
  db.setSetting(BROKER_SETTINGS.RUN_ACCOUNTS, { [RUN]: ACCOUNT, [RUN2]: OTHER });
  db.setSetting(BROKER_SETTINGS.ACCOUNTS, { [ACCOUNT]: { name: NAME, allocation: 100000, hedging: true, leverage: 1, killed: false },
    [OTHER]: { name: OTHER_NAME, allocation: 100000, hedging: true, leverage: 2, killed: false } });
  const log: string[] = [];
  const selected: string[] = [];
  let blockedReconcile = true;
  const session = (label: string) => {
    let account = '';
    return {
      logins: 1, historyTransactions: async () => ({ transactions: [], complete: true }),
      selectAccount: async (id: string) => { account = id; selected.push(`${label}:${id}`); },
      get: async (path: string) => {
        if (path === '/api/v1/accounts') return { accounts: [
          { accountId: ACCOUNT, accountName: NAME, balance: { balance: 100000, deposit: 100000, profitLoss: 0 } },
          { accountId: OTHER, accountName: OTHER_NAME, balance: { balance: 100000, deposit: 100000, profitLoss: 0 } }] };
        if (path === '/api/v1/accounts/preferences') return { hedgingMode: true, leverages: {} };
        if (path === '/api/v1/positions') {
          // Account 1's reconciliation hangs until released; account 2 must not wait for it.
          while (account === ACCOUNT && blockedReconcile) await Bun.sleep(5);
          return { positions: [] };
        }
        if (path.startsWith('/api/v1/confirms/')) return { dealStatus: 'REJECTED', epic: EPIC, direction: 'BUY', size: 100, reason: 'fixture' };
        return {};
      },
      post: async (_p: string, _b: unknown, hooks?: { sent?: () => void }) => { hooks?.sent?.(); log.push(`order on ${account}`); return { dealReference: 'r' }; },
    } as unknown as CapitalClient;
  };
  const sessions = new Map<string, CapitalClient>();
  const candidates: MirrorCandidate[] = [
    { runId: RUN, epic: EPIC, tier: 1, score: 0, side: null, entry: null, pendingOpen: { side: LONG, at: Date.now() } },
    { runId: RUN2, epic: EPIC, tier: 2, score: 0, side: null, entry: null, pendingOpen: { side: LONG, at: Date.now() } },
  ];
  const mirror = new BrokerMirror(session('control'), db, { prefix: 'Arena', accountTiers: { [NAME]: 1, [OTHER_NAME]: 2 },
    sessionFor: id => sessions.get(id) ?? sessions.set(id, session(id)).get(id)! });
  mirror.setCandidateSource(() => candidates);
  try {
    void mirror.start();
    for (let i = 0; i < 100 && selected.length < 2; i++) await Bun.sleep(10);
    const at = candidates[1]!.pendingOpen!.at;
    mirror.onRunEvent({ type: 'order', kind: 'open', runId: RUN2, time: at, side: LONG, size: 500, price: 1.12, stopLoss: null, takeProfit: null });
    for (let i = 0; i < 100 && !log.length; i++) await Bun.sleep(10);
    expect(log).toEqual([`order on ${OTHER}`]); // account 1 is still stuck in its reconciliation
    blockedReconcile = false;
    for (let i = 0; i < 100 && mirror.status().queued; i++) await Bun.sleep(10);
    await Bun.sleep(30);
    expect(selected.sort()).toEqual([`${ACCOUNT}:${ACCOUNT}`, `${OTHER}:${OTHER}`]); // each session chose its account once
  } finally { mirror.stop(); db.db.close(); }
});

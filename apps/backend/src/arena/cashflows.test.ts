import { expect, test } from 'bun:test';
import { ArenaDB, DEAL_STATUS } from './db.ts';
const ACCOUNT = 'arena-owned';
const OTHER_ACCOUNT = 'other';
const DEAL = 'owned-deal';
const EPIC = 'EURUSD';
test('cashflows attach by exact account and deal, are idempotent, and retain fees separately', () => {
  const db = new ArenaDB(':memory:');
  const id = db.insertDeal({
    account: 'Arena 01',
    account_id: ACCOUNT,
    run_id: 'run',
    epic: EPIC,
    side: 'long',
    size: 100,
    paper_size: 500,
    deal_id: DEAL,
    status: DEAL_STATUS.CLOSED,
    open_time: 1,
    open_price: 1,
    paper_open_price: 1,
    close_time: 2,
    close_price: null,
    paper_close_price: null,
    pnl: null,
    note: null,
  });
  const tx = {
    reference: 'transaction',
    dealId: DEAL,
    dateUtc: '2026-10-15T10:00:00',
    transactionType: 'TRADE',
    size: '12.34',
    currency: 'USD',
    status: 'PROCESSED',
  };
  expect(db.recordCashflows(OTHER_ACCOUNT, [tx])).toBe(0);
  db.recordCashflows(ACCOUNT, [tx, tx]);
  db.recordCashflows(ACCOUNT, [{ ...tx, reference: 'funding', transactionType: 'SWAP', size: '-.25' }]);
  const row = db.dealsForRun('run')[0]!;
  expect(row.id).toBe(id);
  expect(row.pnl).toBe(12.34);
  expect(row.cash_adjustment).toBe(-0.25);
  expect(db.db.query('SELECT COUNT(*) AS n FROM broker_cashflows').get()).toEqual({ n: 2 });
  db.db.close();
});

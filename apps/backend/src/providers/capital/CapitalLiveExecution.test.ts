import { test, expect, describe } from 'bun:test';
import { CapitalLiveExecution } from './CapitalLiveExecution.ts';
import type { InstrumentInfo, Position } from '../../core/agent/types.ts';
import type { Trigger } from '../../core/position/PositionMonitor.ts';
import type { CapitalSession } from './CapitalSession.ts';

const US100: InstrumentInfo = {
  epic: 'US100',
  leveraged: true,
  leverage: 200,
  spread: 1.8,
  lotSize: 1,
  minSize: 0.5,
  maxSize: 200,
  sizeIncrement: 0.01,
  pricePrecision: 1,
  tradingHours: { timezone: 'America/New_York', open: '09:30', close: '16:00' },
};

function buyPosition(entryPrice: number = 18501.8): Position {
  return {
    direction: 'BUY',
    size: 1,
    entryPrice,
    entryTime: 1000,
    unrealizedPnL: 0,
    stopLoss: 18400,
    takeProfit: 18600,
  };
}

/**
 * Create a mock CapitalSession that records calls and returns
 * configurable responses.
 */
function mockSession(opts: {
  openDealRef?: string;
  openConfirm?: { dealId: string; level: number; size: number; direction: string };
  closeConfirm?: { dealId: string; level: number; size: number; direction: string };
} = {}) {
  const openDealRef = opts.openDealRef ?? 'ref_123';
  const openConfirm = opts.openConfirm ?? {
    dealId: 'deal_abc',
    level: 18501.8,
    size: 1,
    direction: 'BUY',
  };
  const closeConfirm = opts.closeConfirm ?? {
    dealId: 'deal_abc',
    level: 18600,
    size: 1,
    direction: 'SELL',
  };

  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  let confirmCount = 0;

  return {
    session: {
      post: async (path: string, body?: unknown) => {
        calls.push({ method: 'POST', path, body });
        return { dealReference: openDealRef };
      },
      get: async (path: string) => {
        calls.push({ method: 'GET', path });
        confirmCount++;
        // First call is open confirm, subsequent calls are close confirm
        if (path.includes(openDealRef)) {
          return {
            dealStatus: 'ACCEPTED',
            ...openConfirm,
          };
        }
        // Close confirmation via dealId
        return {
          dealStatus: 'ACCEPTED',
          ...closeConfirm,
        };
      },
      delete: async (path: string) => {
        calls.push({ method: 'DELETE', path });
        return {};
      },
    } as unknown as CapitalSession,
    calls,
  };
}

describe('CapitalLiveExecution', () => {
  test('executeOpen sends correct API call and returns fill', async () => {
    const { session, calls } = mockSession();
    const execution = new CapitalLiveExecution(session, US100);

    const fill = await execution.executeOpen('BUY', 1, 18500, 1000);

    // Check API call
    const postCall = calls.find(c => c.method === 'POST');
    expect(postCall).toBeDefined();
    expect(postCall!.path).toBe('/api/v1/positions');
    expect(postCall!.body).toEqual({ epic: 'US100', direction: 'BUY', size: 1 });

    // Check fill
    expect(fill.action).toBe('OPENED');
    expect(fill.reason).toBe('ORDER');
    expect(fill.side).toBe('BUY');
    expect(fill.size).toBe(1);
    expect(fill.price).toBe(18501.8);
    expect(fill.timestamp).toBe(1000);
    expect(fill.pnl).toBeUndefined();
  });

  test('executeClose sends DELETE and returns fill with pnl', async () => {
    const { session, calls } = mockSession({
      closeConfirm: { dealId: 'deal_abc', level: 18600, size: 1, direction: 'SELL' },
    });
    const execution = new CapitalLiveExecution(session, US100);

    // First open so activeDealId is set
    await execution.executeOpen('BUY', 1, 18500, 1000);

    const position = buyPosition(18501.8);
    const fill = await execution.executeClose(position, 18600, 2000);

    // Check DELETE call
    const deleteCall = calls.find(c => c.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(deleteCall!.path).toBe('/api/v1/positions/deal_abc');

    // Check fill
    expect(fill.action).toBe('CLOSED');
    expect(fill.reason).toBe('ORDER');
    expect(fill.side).toBe('SELL'); // opposite of BUY
    expect(fill.price).toBe(18600);
    expect(fill.pnl).toBeCloseTo(98.2); // (18600 - 18501.8) * 1 * 1
    expect(fill.timestamp).toBe(2000);
  });

  test('executeTrigger closes position with trigger reason', async () => {
    const { session } = mockSession({
      closeConfirm: { dealId: 'deal_abc', level: 18400, size: 1, direction: 'SELL' },
    });
    const execution = new CapitalLiveExecution(session, US100);

    await execution.executeOpen('BUY', 1, 18500, 1000);

    const trigger: Trigger = { reason: 'STOP_LOSS', price: 18400 };
    const position = buyPosition(18501.8);
    const fill = await execution.executeTrigger(trigger, position, 2000);

    expect(fill.action).toBe('CLOSED');
    expect(fill.reason).toBe('STOP_LOSS');
    expect(fill.price).toBe(18400);
    expect(fill.pnl).toBeCloseTo(-101.8); // (18400 - 18501.8) * 1 * 1
  });

  test('throws when closing with no active deal', async () => {
    const { session } = mockSession();
    const execution = new CapitalLiveExecution(session, US100);

    const position = buyPosition();
    await expect(execution.executeClose(position, 18600, 2000))
      .rejects.toThrow('No active deal to close');
  });

  test('SELL executeOpen sends correct direction', async () => {
    const { session, calls } = mockSession({
      openConfirm: { dealId: 'deal_sell', level: 18500, size: 2, direction: 'SELL' },
    });
    const execution = new CapitalLiveExecution(session, US100);

    const fill = await execution.executeOpen('SELL', 2, 18500, 1000);

    const postCall = calls.find(c => c.method === 'POST');
    expect(postCall!.body).toEqual({ epic: 'US100', direction: 'SELL', size: 2 });
    expect(fill.side).toBe('SELL');
    expect(fill.size).toBe(2);
    expect(fill.price).toBe(18500);
  });
});

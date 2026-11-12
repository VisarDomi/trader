import type { ExecutionCostEvidence, FillQuoteEvidence } from '@trader/shared/types';
import type { Trade } from '../sdk/types.ts';
import type { Quote } from './run.ts';

const round = (n: number) => Math.round(n * 1e8) / 1e8;
/**
 * Only a quote consistent with the executable fill can support cost attribution. An exit at `limit` (a target
 * filled at its level between quotes) is supported by the quote that crossed the level: its side is at or beyond
 * the fill, and the difference lands in adjustmentPnl.
 */
export function fillQuote(q: Quote | null, side: Trade['side'], entry: boolean, price: number, precision: number,
  decisionMid?: number, at?: number, limit?: number): FillQuoteEvidence | undefined {
  if (!q||!Number.isFinite(q.bid)||!Number.isFinite(q.ask)||q.bid<=0||q.ask<q.bid) return;
  const reference = (side === 'long') === entry ? q.ask : q.bid;
  const scale = 10 ** precision, tolerance = 1 / scale * 1e-6;
  const expected = entry ? reference : Math.round(reference * scale) / scale;
  const atLevel = !entry && limit !== undefined && Math.abs(Math.round(limit * scale) / scale - price) <= tolerance &&
    (side === 'long' ? expected >= price - tolerance : expected <= price + tolerance);
  if (Math.abs(expected - price) > tolerance && !atLevel) return;
  return { mid: (q.bid + q.ask) / 2, spread: q.ask - q.bid, source: q.source ?? 'candle',
    ...(atLevel && Math.abs(expected - price) > tolerance ? { limit: price } : {}),
    ...(q.journalId!==undefined?{journalId:q.journalId}:{}),...(q.sequence!==undefined?{sequence:q.sequence}:{}),
    ...(decisionMid !== undefined ? { decisionMid } : {}),
    ...(at !== undefined ? { ageMs: Math.max(0, at - (q.receivedAt ?? q.time)) } : {}) };
}

/** Fixed observed trades, not a counterfactual re-sizing or stop/liquidation simulation. */
export function executionCosts(trade: Pick<Trade, 'side' | 'size' | 'pnl' | 'funding'>,
  entry: FillQuoteEvidence, exit: FillQuoteEvidence,
  method: ExecutionCostEvidence['method'] = 'fill-quotes'): ExecutionCostEvidence {
  const sign = trade.side === 'long' ? 1 : -1;
  const midpointPnl = sign * (exit.mid - entry.mid) * trade.size;
  const spreadCost = (entry.spread + exit.spread) * trade.size / 2;
  const signalPnl = entry.decisionMid === undefined || exit.decisionMid === undefined ? null
    : sign * (exit.decisionMid - entry.decisionMid) * trade.size;
  return { method, source: entry.source === exit.source ? entry.source : 'mixed', entry, exit,
    midpointPnl: round(midpointPnl), spreadCost: round(spreadCost),
    timingCost: signalPnl === null ? null : round(signalPnl - midpointPnl),
    adjustmentPnl: round(trade.pnl - (midpointPnl - spreadCost + trade.funding)) };
}

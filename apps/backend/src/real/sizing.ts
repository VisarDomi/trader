import type { Instrument } from '../engine/instruments.ts';

export interface RealSizeResult {
  size: number | null;
  estimatedMargin: number;
  reason?: string;
}

/**
 * Size an order for the single Real USD account from the strategy's $10,000 reference size.
 *
 * - Scales proportionally to the real USD account's actual equity (`paperSize × realEquity / paperEquity`).
 * - Caps margin to 95% of `realAvailable` so spread/slippage cannot push a proportional order over margin.
 * - On small balances where the proportional size rounds below `inst.minSize`, uses `inst.minSize`
 *   when `realAvailable` can cover at least 90% of the estimated minimum margin (leaving final
 *   margin acceptance to Capital.com), otherwise skips with an explicit margin shortfall reason.
 */
export function realOrderSize(
  inst: Pick<Instrument, 'epic' | 'minSize' | 'sizeStep' | 'maxSize'>,
  paperSize: number,
  paperEquity: number,
  realEquity: number,
  realAvailable: number,
  price: number,
  leverage: number,
): RealSizeResult {
  if (!(paperSize > 0) || !(paperEquity > 0) || !(price > 0) || !(leverage > 0)) {
    return { size: null, estimatedMargin: 0, reason: 'invalid sizing inputs' };
  }
  if (!(realEquity > 0) || !(realAvailable > 0)) {
    return { size: null, estimatedMargin: 0, reason: `no available USD balance ($${realAvailable.toFixed(2)})` };
  }

  const quantize = (raw: number): number => {
    const stepped = Math.floor(raw / inst.sizeStep + 1e-9) * inst.sizeStep;
    return Number(Math.min(inst.maxSize, Math.max(0, stepped)).toFixed(10));
  };

  const marginFor = (size: number): number => (size * price) / leverage;

  const proportionalRaw = paperSize * (realEquity / paperEquity);
  const maxByAvailable = (realAvailable * 0.95 * leverage) / price;
  const proportional = quantize(Math.min(proportionalRaw, maxByAvailable));

  if (proportional >= inst.minSize) {
    return { size: proportional, estimatedMargin: marginFor(proportional) };
  }

  const minMargin = marginFor(inst.minSize);
  if (realAvailable >= minMargin * 0.9) {
    return { size: inst.minSize, estimatedMargin: minMargin };
  }

  return {
    size: null,
    estimatedMargin: minMargin,
    reason: `insufficient Real USD margin: $${realAvailable.toFixed(2)} available, ~$${minMargin.toFixed(2)} needed for minimum ${inst.minSize} ${inst.epic} at 1:${leverage}`,
  };
}

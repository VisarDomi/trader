/**
 * Leverage — the account setting every run trades under.
 *
 * Capital.com sets leverage per account and asset class; a position keeps the
 * leverage it was opened with. On the user's login the choices are 1, 2, 3, 4,
 * 5, 10, 20, (30 on FX), 50, 100 and 200 for indices, commodities and FX, and
 * at most 20 for crypto and shares (checked 2026-10-07).
 *
 * What leverage changes for a run:
 *   - margin = notional ÷ leverage: it caps the position size an agent can open
 *     and sets when a losing position is closed (equity below half the margin)
 *   - at 1:1, crypto and shares pay no overnight funding (Capital.com, since
 *     2024-07; indices, commodities and FX still do)
 * An agent that sizes by risk to a stop uses only as much leverage as the stop
 * needs, so for it the setting is a ceiling. `marginPct` sizing (and
 * `ctx.leverage`) lets an agent use the leverage on purpose.
 */
import type { AssetClass, Instrument } from './instruments.ts';
import { ASSET_CLASS } from './instruments.ts';

/** The account leverages the arena uses: one demo account per tier (agents/roster.json maps them). */
export const LEVERAGE_TIERS = [1, 2, 3, 5, 10, 20, 50, 100, 200] as const;
export type LeverageTier = (typeof LEVERAGE_TIERS)[number];

/** Highest leverage Capital.com offers per asset class on this login. */
export const MAX_LEVERAGE: Record<AssetClass, number> = {
  [ASSET_CLASS.INDEX]: 200,
  [ASSET_CLASS.COMMODITY]: 200,
  [ASSET_CLASS.FX]: 200,
  [ASSET_CLASS.CRYPTO]: 20,
  [ASSET_CLASS.SHARE]: 20,
};

/** Asset classes with no overnight funding on 1:1 positions. */
const FUNDING_FREE_UNLEVERAGED: ReadonlySet<AssetClass> = new Set([ASSET_CLASS.CRYPTO, ASSET_CLASS.SHARE]);

/** Capital.com's names for the asset classes in GET/PUT /accounts/preferences. */
export const CAPITAL_LEVERAGE_CLASS: Record<AssetClass, string> = {
  [ASSET_CLASS.INDEX]: 'INDICES',
  [ASSET_CLASS.COMMODITY]: 'COMMODITIES',
  [ASSET_CLASS.FX]: 'CURRENCIES',
  [ASSET_CLASS.CRYPTO]: 'CRYPTOCURRENCIES',
  [ASSET_CLASS.SHARE]: 'SHARES',
};

export function isLeverageTier(x: unknown): x is LeverageTier {
  return (LEVERAGE_TIERS as readonly unknown[]).includes(x);
}

/** Leverage a position on this instrument gets on an account of the given tier. */
export function effectiveLeverage(instrument: Instrument, tier: number): number {
  return Math.min(tier, MAX_LEVERAGE[instrument.assetClass]);
}

export function isFundingFree(instrument: Instrument, tier: number): boolean {
  return effectiveLeverage(instrument, tier) === 1 && FUNDING_FREE_UNLEVERAGED.has(instrument.assetClass);
}

/** The per-asset-class leverages to set on a demo account of this tier. */
export function accountLeverages(tier: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cls, name] of Object.entries(CAPITAL_LEVERAGE_CLASS)) out[name] = Math.min(tier, MAX_LEVERAGE[cls as AssetClass]);
  return out;
}

/** "1:200" */
export function leverageLabel(tier: number): string {
  return `1:${tier}`;
}

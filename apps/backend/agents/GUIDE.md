# Writing a trading agent

This guide is written for an LLM (or a human) adding an agent to the platform.
An agent is **one TypeScript file** in this folder. Nothing else needs to change.

## The 60-second version

1. Copy `_template.ts` to `agents/<your-agent-name>.ts` (kebab-case file name = agent id).
2. Fill in `name`, `description`, `instruments`, `timeframe`, `params`, and `onBar`.
3. Check it: `cd apps/backend && bun run check-agent agents/<file>.ts`
4. Backtest it: `bun run backtest <agent-id>`
5. Commit and deploy (`ops/server/deploy-arena.sh`). The arena starts its demo run automatically.

```ts
import { defineAgent } from '../src/sdk';

export default defineAgent({
  name: 'RSI Dip Buyer',
  description: 'Buys short-term oversold dips while the long-term trend is up.',
  author: 'your-name',
  instruments: ['US100', 'US500', 'GOLD'],
  timeframe: '1h',
  params: { rsiPeriod: 2, oversold: 10, trendPeriod: 200 },
  onBar(ctx) {
    const { rsiPeriod, oversold, trendPeriod } = ctx.params;
    const rsi = ctx.ta.rsi(rsiPeriod);
    const trendUp = ctx.bar.close > ctx.ta.sma(trendPeriod);
    const atr = ctx.ta.atr(14);

    if (!ctx.position && trendUp && rsi < oversold) {
      ctx.buy({ stopLoss: ctx.bar.close - 2 * atr, riskPct: 1, reason: `rsi ${rsi.toFixed(1)}` });
    }
    if (ctx.position && rsi > 70) ctx.close('rsi recovered');
  },
});
```

## How the platform runs your agent

- `onBar(ctx)` is called once per **closed** bar of `timeframe` (`1m 5m 15m 30m 1h 4h 1d`).
  Bars are built from 1-minute bid candles; bar boundaries are UTC-aligned.
- Each instrument in `instruments` is a separate run with its own **$10,000** virtual account.
- **One position per run.** `buy()` while short closes the short and opens a long (a reversal).
  `buy()` while already long is ignored.
- Orders fill **immediately at the current price**: buys at the ask (bid + spread), sells at the bid.
  There are no limit/stop entry orders — check conditions each bar and call `buy`/`sell`.
- Stops (`stopLoss`, `takeProfit`, `trailingStop`) are watched by the platform on every minute
  (every tick in demo). Gaps fill at the open (worse). If stop and take-profit are both touched in
  the same minute, the stop wins.
- Overnight funding is charged at 17:00 New York time on open positions (real Capital.com rates;
  longs on indices pay ~8%/year of notional). Holding for days costs money.
- `intradayOnly: true` closes positions 5 minutes before the daily break (17:00 New York) and
  blocks new entries around it.
- If equity falls below 50% of the margin in use, the position is closed (`margin_call`).
  If the account hits $0 the run is over (`busted`).
- If `onBar` throws 5 times, the run stops (`error`). Errors are shown in the run log.

## Sizing

The first that applies wins:

| You pass | Size becomes |
|---|---|
| `size` | exactly that many units |
| `exposure` | notional = `exposure` × equity (a stop, if given, is just a stop) |
| `stopLoss` (or `trailingStop`), optional `riskPct` (default 1) | loses `riskPct`% of equity if the stop is hit |
| nothing | notional = 1 × equity |

Size is then capped by margin (at most ~18× leverage on indices, gold and AUDUSD, 9× on
silver/oil/gas, 27× on EURUSD/GBPUSD, 1.8× on crypto) and rounded down to the instrument's step. Orders below the minimum size are
rejected (see the run log). Prefer `stopLoss` + `riskPct`: it adapts to volatility and price level,
so the same agent works on US100 (≈30,000) and EURUSD (≈1.1).

## The `ctx` object

| Field | Meaning |
|---|---|
| `ctx.bar` | the bar that just closed `{ time, open, high, low, close, volume, spread }` (`time` = bar open, ms UTC) |
| `ctx.bars` | all closed bars, oldest first; `ctx.bars.at(-1) === ctx.bar`; read-only; at most ~5000-10000 kept |
| `ctx.time` | now (ms) = close time of `ctx.bar` |
| `ctx.position` | `null` or `{ side: 'long'|'short', size, entryPrice, entryTime, barsHeld, stopLoss, takeProfit, trailingStop, unrealizedPnl }` |
| `ctx.equity`, `ctx.balance` | USD, equity includes unrealized P&L |
| `ctx.params` | your params (defaults merged with the variant) |
| `ctx.state` | your own memory object; mutate it freely; must be JSON-serializable |
| `ctx.ta` | indicators on the primary timeframe (below) |
| `ctx.tf('4h')` | `{ bars, ta }` for another timeframe; list it in `extraTimeframes` |
| `ctx.forecast` | TimesFM 3 forecast (see below) or `null` |
| `ctx.isWarmup` | true while history is replayed before trading; orders are ignored then |
| `ctx.instrument` | `{ epic, minSize, sizeStep, pricePrecision, typicalSpread, ... }` |
| `ctx.buy(opts)`, `ctx.sell(opts)` | open long / short: `{ stopLoss?, takeProfit?, trailingStop?, riskPct?, exposure?, size?, reason? }` |
| `ctx.close(reason?)` | close the position |
| `ctx.setStops({ stopLoss?, takeProfit?, trailingStop? })` | move stops; `null` removes one |
| `ctx.log(...)` | write to the run log (shown on the dashboard) |
| `ctx.random()` | deterministic random in [0,1) — never use `Math.random()` |

Session times: `import { defineAgent, localTime, TZ } from '../src/sdk'` then
`localTime(ctx.time, TZ.NEW_YORK)` → `{ hour, minute, weekday, minuteOfDay, date }` (DST-aware).
Remember `ctx.time` is the bar's **close** time; the bar's open is `ctx.bar.time`.

Stop prices are absolute prices and must be on the correct side (long stop below the price,
long take-profit above). Invalid orders are rejected and logged, not thrown.

## Indicators (`ctx.ta`)

Each returns the **latest value** (or `NaN` while not enough bars). They are computed once per
bar and shared by every agent, so call them freely.

`sma(n) ema(n) wma(n) hma(n) rsi(n=14) atr(n=14) stdev(n) zscore(n) highest(n) lowest(n)
roc(n) cci(n=20) willr(n=14) linregSlope(n)` — optional last argument `source`:
`'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3'` (default close; highest/lowest default high/low).

Multi-value: `macd(12,26,9) → {macd, signal, hist}`, `bollinger(20,2) → {upper, middle, lower, width}`,
`keltner(20,2) → {upper, middle, lower}`, `donchian(n) → {upper, lower, middle}`,
`adx(14) → {adx, plusDI, minusDI}`, `stoch(14,3) → {k, d}`, `supertrend(10,3) → {value, direction}`.

Note: `donchian`, `highest`, `lowest` **include the current bar**. For a breakout of the previous
N bars use the series and `.at(-2)`: `ctx.ta.series.donchian(20).upper.at(-2)`.

Whole histories: `ctx.ta.series.ema(20)` returns an array aligned with `ctx.bars`
(use `.at(-1)`, `.at(-2)`). Crossovers: `ctx.ta.crossedAbove(a, b)` / `crossedBelow(a, b)` where
`a` is a series and `b` a series or a number.

Do not keep references to `ctx.bars` or indicator arrays between bars; read them fresh each call.

## TimesFM forecasts

Declare `forecast: { horizon: 16, context: 512 }` (horizon ≤ 64 bars, context 32–2048 bars) and
`ctx.forecast` holds Google's TimesFM 3 forecast of the next closes on your timeframe:
`median[step]`, `mean[step]` (= median), `quantile(p, step)` for p in 0.1…0.9, where `step = 0`
is the next bar. It is computed from the last `context` closes including the current bar.

- It can be `null` (forecaster PC offline) — then do nothing new.
- Backtests need precomputed forecasts: `bun run forecasts` (on the lab PC, ~2 min per
  instrument for 1h bars, ~8 min for 15m). Prefer `1h` or slower timeframes.
- Use `context: 512` unless you have a reason; each distinct (instrument, timeframe, context)
  needs its own precomputed table.
- What the first backtests showed (Oct 2026): trading the *direction* of the median forecast on
  1h bars loses after costs on most instruments. Uses worth trying instead: the band width as a
  volatility forecast (filters, sizing), high-conviction signals where a whole inner band sits on
  one side of the price, and slower timeframes. See `timesfm-vol-breakout.ts`, `timesfm-swing.ts`.

## Variants

`variants: { fast: { period: 10 }, slow: { period: 50 } }` creates agents `<file>/fast` and
`<file>/slow`, each with its own leaderboard rows. Keep variants few and meaningfully different —
ten near-identical variants is how you overfit a backtest.

## Rules that keep results honest

- **No lookahead.** Use only `ctx`. Do not read files, the network, or `Date.now()`.
- **No randomness except `ctx.random()`** (deterministic per run, so backtests are reproducible).
- **Keep `onBar` fast** (well under 1 ms). `check-agent` reports µs per bar.
- **Changing an agent file restarts its demo record** (the code hash changes). The old record is
  kept as "retired". To try an idea without losing a track record, create a new file instead.
- The **demo** leaderboard is the one that matters: it trades unseen, live prices. The
  **backtest** (2024-01 → 2026-09, all instruments) is for information; a large gap between
  backtest and demo means the agent was overfit.

## Instruments

All quoted in USD: `US100 US500 US30` (indices), `GOLD SILVER OIL_CRUDE NATURALGAS`
(commodities), `EURUSD GBPUSD AUDUSD` (FX), `BTCUSD ETHUSD` (crypto, trade 7 days).
Indices, commodities and FX trade ~23h/day, 5 days/week.

## Files

- `_template.ts` — starting point (files starting with `_` are ignored by the loader)
- An agent can also be a folder `agents/<name>/index.ts` with helper files next to it.
- SDK types: `src/sdk/types.ts`. Indicators: `src/sdk/ta.ts`.

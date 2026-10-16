# Writing a trading agent

This guide is written for an LLM (or a human) adding an agent to the platform.
An agent is **one TypeScript file** in this folder. Nothing else needs to change.

## The 60-second version

1. Copy `_template.ts` to `agents/<your-agent-name>.ts` (kebab-case file name = agent id).
2. Fill in `name`, `description`, `instruments`, `timeframe`, `params`, and `onTick` (or `onBar` for closed-bar signals).
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

- `onTick(ctx)` receives every accepted delivered bid/ask quote. `ctx.time` is its local delivery
  time; `ctx.tick.time` is Capital's timestamp, `ctx.tick.receivedAt` its arrival time, and
  `ctx.tick.source` is `live`, `recorded` or `synthetic`. `ctx.bar` is the latest closed primary bar,
  or null before the first one. `ctx.ticks` is a bounded recent-quote window.
- `onBar(ctx)` is optional and runs once per closed primary bar. Its `ctx.time` remains the bar's
  UTC close time; `ctx.tick` gives the current available quote. A definition needs at least one of
  `onTick` or `onBar`. Both callbacks may coexist. All agents' fills and protections use ticks.
- Bars are built from the delivered bid quotes and close at UTC boundaries without inventing empty
  bars. Closed-bar strategies retain their intended cadence; adding tick execution does not call
  their `onBar` hundreds of times or reset their agent versions.
- Each instrument in `instruments`, at each account leverage the agent runs at, is a separate run with its own
  **$10,000** virtual account (see [Leverage](#leverage)).
- **One position per run.** `buy()` while short closes the short and opens a long (a reversal).
  `buy()` while already long is ignored.
- In backtests and the virtual arena, orders queue with API pacing and transport
  delay, then fill on a fresh quote: buys at ask, sells at bid. `ctx.position` changes when filled;
  `onFill` is the completion callback. `ctx.close()` cancels an open still in flight.
  There are no limit/stop entry orders — check conditions in your chosen callback and call `buy`/`sell`.
- Stops, trailing protections and margin are checked on each usable tick in both modes. The first
  touched protection wins according to that path; gaps fill at the next available bid/ask, not an
  invented stop price. Synthetic paths cannot establish which level the historical market hit first.
- History: in the arena, `1d` series hold daily bars from 2024-01 (seeded at start), so 200-day or
  12-month lookbacks on daily bars work from the first day; other timeframes start with the last 120 days
  (about 2,800 `1h` or 700 `4h` bars). Backtests start in 2024-01, so the first year of a 12-month rule
  has no trades there.
- Overnight funding is charged at 17:00 New York time on open positions (real Capital.com rates;
  longs on indices pay ~8%/year of notional). Holding for days costs money, except at 1:1 leverage, where
  nothing but natural gas pays it.
- `intradayOnly: true` closes positions 5 minutes before the daily break (17:00 New York) and
  blocks new entries around it.
- If equity falls below 50% of the margin in use, the position is closed (`margin_call`).
  If the account hits $0 the run is over (`busted`).
- If agent callbacks throw 5 times, the run stops (`error`). Errors are shown in the run log.

## Sizing

The first that applies wins:

| You pass | Size becomes |
|---|---|
| `size` | exactly that many units |
| `exposure` | notional = `exposure` × equity (a stop, if given, is just a stop) |
| `marginPct` | notional = `marginPct`% of equity × `ctx.leverage`: that share of equity is put up as margin |
| `stopLoss` (or `trailingStop`), optional `riskPct` (default 1) | loses `riskPct`% of equity if the stop is hit |
| nothing | notional = 1 × equity |

Live mode accepts one fixed or trailing stop, validates Capital distance rules, and checks market/quote
freshness and margin at execution. Do not assume submission guarantees a fill.

Size is then capped by margin, at most 0.9 × equity × `ctx.leverage` of notional (0.9× equity at 1:1),
and rounded down to the instrument's step. Orders below the minimum size are rejected (see the run log).
Prefer `stopLoss` + `riskPct`: it adapts to volatility and price level, so the same agent works on US100
(≈30,000) and EURUSD (≈1.1). Use `marginPct` only when the idea is about using leverage.

## The `ctx` object

| Field | Meaning |
|---|---|
| `ctx.bar` | the bar that just closed `{ time, open, high, low, close, volume, spread }` (`time` = bar open, ms UTC) |
| `ctx.bars` | all closed bars, oldest first; `ctx.bars.at(-1) === ctx.bar`; read-only; at most ~5000-10000 kept |
| `ctx.time` | tick delivery time in onTick/onFill; primary bar close time in onBar |
| `ctx.tick`, `ctx.ticks` | current quote and bounded recent quotes, with source and broker/arrival timestamps |
| `ctx.position` | `null` or `{ side: 'long'|'short', size, entryPrice, entryTime, barsHeld, stopLoss, takeProfit, trailingStop, unrealizedPnl }` |
| `ctx.equity`, `ctx.balance` | USD, equity includes unrealized P&L |
| `ctx.params` | your params (defaults merged with the variant) |
| `ctx.state` | your own memory object; mutate it freely; must be JSON-serializable |
| `ctx.ta` | indicators on the primary timeframe (below) |
| `ctx.tf('4h')` | `{ bars, ta }` for another timeframe; list it in `extraTimeframes` |
| `ctx.forecast` | TimesFM 3 forecast (see below) or `null` |
| `ctx.isWarmup` | true while history is replayed before trading; orders are ignored then |
| `ctx.instrument` | `{ epic, assetClass, minSize, sizeStep, pricePrecision, typicalSpread, marginFactor, ... }` |
| `ctx.leverage` | this run's leverage on this instrument: 1 … 200 (crypto and shares at most 20) |
| `ctx.buy(opts)`, `ctx.sell(opts)` | open long / short: `{ stopLoss?, takeProfit?, trailingStop?, riskPct?, marginPct?, exposure?, size?, reason? }` |
| `ctx.close(reason?)` | close the position |
| `ctx.setStops({ stopLoss?, takeProfit?, trailingStop? })` | move stops; `null` removes one |
| `ctx.log(...)` | write to the run log (shown on the dashboard) |
| `ctx.random()` | deterministic random in [0,1) — never use `Math.random()` |

Session times: `import { defineAgent, localTime, TZ } from '../src/sdk'` then
`localTime(ctx.time, TZ.NEW_YORK)` → `{ hour, minute, weekday, minuteOfDay, date }` (DST-aware).
In `onBar`, `ctx.time` is the bar's **close** time; the bar's open is `ctx.bar.time`.

For minute-specific orders use a `1m` primary timeframe. Optional `validUntil` (UTC ms) discards an entry
that reaches execution too late, including Capital mirror retries. Optional `closeAt` requests a timed exit
from the arena's one-second clock; Capital closes are also requested independently of quote/bar delivery.
Both survive restarts. The actual fill follows market availability, API pacing and network latency. In a
backtest, a missing exit minute closes at the next observed candle's open instead of inventing a price.
`TZ.TIRANA` provides DST-aware Albania time. See `visar-night-trading.ts` for a complete example.

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

## Leverage

Each of the nine Arena demo accounts trades at one leverage: 1:1, 1:2, 1:3, 1:5, 1:10, 1:20, 1:50,
1:100 or 1:200. Every run belongs to one of them, and its paper account follows the same rules:

- margin = notional ÷ leverage; a position is capped at 0.9 × equity × leverage and is closed when
  equity falls below half its margin, so high leverage lets a loss run much further;
- at 1:1 there is no overnight funding on anything except natural gas (verified on the demo accounts);
- crypto and shares go no higher than 1:20, so on a 1:50+ account they trade at 1:20.

An agent that risks 1% against a stop uses only the leverage its stop needs (most use under 5×), so for
it the account leverage is just a ceiling. **Which tiers an agent runs at is decided in
`agents/roster.json`, not in the agent file** (see `LIFECYCLE.md`), so moving an agent never changes its
code hash. Declare `leverage: [1, 200]` in the definition only when the idea itself depends on leverage
(e.g. a fee-free 1:1 holder, or an agent that sizes with `marginPct`); each listed tier becomes its own
run. `check-agent` reports how much leverage an agent actually uses.

## Variants

`variants: { fast: { period: 10 }, slow: { period: 50 } }` creates agents `<file>/fast` and
`<file>/slow`, each with its own leaderboard rows. Keep variants few and meaningfully different —
ten near-identical variants is how you overfit a backtest.

## Rules that keep results honest

- **No lookahead.** Use only `ctx`. Do not read files, the network, or `Date.now()`.
- **No randomness except `ctx.random()`** (deterministic per run, so backtests are reproducible).
- **Keep `onBar` fast** (well under 1 ms). `check-agent` reports µs per bar and per tick.
- **Changing an agent file restarts its demo record** (the code hash changes). The old record is
  kept as "retired". To try an idea without losing a track record, create a new file instead.
- The **demo** leaderboard is the one that matters: it trades unseen, live prices. The
  **backtest** (2024-01 → 2026-09, all instruments) is for information; a large gap between
  backtest and demo means the agent was overfit.
- After deployment an agent moves through the lifecycle in [`LIFECYCLE.md`](LIFECYCLE.md): judged
  after 30 trades and 4 weeks, retired if it loses, mirrored on the broker while it ranks well.
  Retiring one instrument (or one leverage) goes in `roster.json`, never in the agent file.

## Instruments

All quoted in USD: `US100 US500 US30` (indices), `GOLD SILVER OIL_CRUDE NATURALGAS`
(commodities), `EURUSD GBPUSD AUDUSD` (FX), `BTCUSD ETHUSD` (crypto, trade 7 days),
`NVDA MSFT AAPL AMZN AVGO META GOOGL TSLA` (shares: the largest Nasdaq-100 companies; trade 24h on
weekdays, history from 2024; dividends are not modelled). Indices, commodities and FX trade ~23h/day,
5 days/week.

## Files

- `_template.ts` — starting point (files starting with `_` are ignored by the loader)
- An agent can also be a folder `agents/<name>/index.ts` with helper files next to it.
- SDK types: `src/sdk/types.ts`. Indicators: `src/sdk/ta.ts`.

## Historical tick input and storage

`bun run backtest` defaults to recorded quotes where they exist and lazily generated minute paths
elsewhere. Recorded minutes use only the captured stream, including its sparse periods; synthetic
updates are not inserted into a recorded minute. `--ticks recorded` disables the fallback;
`--ticks synthetic` forces it. Custom windows and synthetic scenarios have separate records and never
replace the shared comparison window for admission. Examples:

```sh
bun run backtest my-agent --from 2026-10-16 --to 2026-10-17 --ticks recorded
bun run backtest my-agent --ticks synthetic --tick-seed 2 --ticks-per-minute 64
```

Synthetic bid paths preserve minute OHLC, choose deterministic extreme order and interpolated movement,
use the candle's close spread (or typical spread), and default to 16 ticks/minute, seed 1. The path and
cadence are assumptions. Compare other seeds/densities for robustness; do not present them as observed
historical ticks. Results and the dashboard expose source counts, coverage, generator, seed and engine version.

The one permanent quote copy is losslessly compressed PostgreSQL blocks. A small acknowledged server
spool supports transfer and restart recovery; no synthetic tape or second raw tick database is retained.
See [TICKS.md](../TICKS.md) for the capture contract, limitations and 100 GB project budget.

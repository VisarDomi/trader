# Research brief (read this first)

Why: the user has run out of ideas for this project and asked for research to get inspired: trading
strategies in general, strategies that fit this platform, and anything about **leverage** (the newest
dimension). The research is a reference library: when the user later asks about something in the report,
the notes and the saved material must let us answer without searching again.

## The platform in one screen

- **Arena:** ~480 paper "runs" trade forward on live Capital.com **demo** prices; the best 450 are mirrored as
  real demo orders on nine accounts. Demo only, never live money. Dashboard: trader.veron3.space.
- **Instruments (CFDs, all USD):** indices US100, US500, US30; commodities GOLD, SILVER, OIL_CRUDE,
  NATURALGAS; FX EURUSD, GBPUSD, AUDUSD; crypto BTCUSD, ETHUSD (7 days a week); shares NVDA, MSFT, AAPL,
  AMZN, AVGO, META, GOOGL, TSLA (24h on weekdays). 1-minute candles from 2024-01 on the lab PC.
- **Leverage tiers:** each of the nine accounts has one leverage: 1:1, 1:2, 1:3, 1:5, 1:10, 1:20, 1:50,
  1:100, 1:200 (crypto and shares at most 1:20). Margin = notional ÷ leverage; a position is closed when
  equity falls below 50% of its margin.
- **Costs:** spread on every trade; overnight funding on CFDs (long indices and shares ≈ 8% a year of
  notional, ≈ 0 short; gold ≈ 6%; crypto ≈ 22% a year long). **At 1:1, crypto and shares pay no
  overnight fee** (Capital.com rule since 2024). Share CFDs get dividend adjustments (long receives, short
  pays) — the engine does not model dividends yet.
- **Agents:** one TypeScript file; `onBar(ctx)` per closed bar (1m … 1d), **one instrument and one
  position per run** (no portfolios or pairs yet), market orders only, stops/take-profit/trailing stops,
  sizing by risk to a stop, by exposure, or by `marginPct` (uses the leverage on purpose). TimesFM 3
  forecasts available on request. Code: `apps/backend/agents/GUIDE.md`.
- **Lifecycle:** judged after 30 trades and 28 days by the trade t-statistic; retired at t ≤ −1; "leader" at
  t ≥ 2 and above every random-entry monkey. New agents: 1–3 a week, parameters fixed up front (no backtest
  tuning), a documented reason to work. `apps/backend/agents/LIFECYCLE.md`.
- **What exists already** (see the idea log at the end of `apps/backend/agents/JOURNAL.md`): trend
  (EMA/MACD/SuperTrend/Donchian/Keltner/HMA/ADX/TSMOM), mean reversion (RSI2, z-score, Bollinger fade,
  stochastic, swing reversal), breakouts (volatility breakout, squeeze, inside bar, London and NY opening
  ranges), overnight drift, turn of the month, volatility targeting, TimesFM agents, buy-and-hold and a
  leverage ladder as controls. Rejected: intraday momentum (last half hour follows the first) — the spread
  was bigger than the edge.

## What to look for

Sources: arXiv (q-fin), SSRN, journals' open versions, GitHub (repos, strategy collections), Reddit
(r/algotrading, r/quant, r/LETFs, r/Forex, r/options, r/BitcoinMarkets …), Hacker News (hn.algolia.com
API), practitioner blogs and newsletters (Quantpedia, Alpha Architect, Robot Wealth, Quantocracy, Flirting
with Models, Allocate Smartly, Concretum, Return Stacked …), broker docs, and any site worth knowing.
Prefer evidence (out-of-sample, post-publication, costs included) over claims. Note when an effect decayed.

## Where to put things (conventions)

- `research/topics/<slug>.md` — your topic note (one file, you own it). Structure:
  1. `# Title`, then `_First pass 2026-10-13._`
  2. `## In short` — 5–8 bullets a busy reader needs.
  3. `## Findings` — one `###` per strategy/idea/result: what it is, the evidence (numbers, periods, costs),
     who found it, whether it survived out of sample; cite sources as `[slug-NN]`.
  4. `## For the arena` — concrete ideas mapped to *our* instruments, timeframes, leverage tiers and SDK
     (feasible now / needs a platform change), each with fixed textbook parameters; and platform changes
     worth considering.
  5. `## Open questions` — what a second pass should dig into.
  6. `## Sources` — table: `| id | title | authors / site | year | kind | link | local copy |`.
- `research/sources/<slug>.json` — the same sources as JSON:
  `[{ "id": "<slug>-01", "title": "", "authors": "", "year": 2024, "kind": "paper|repo|thread|blog|doc|book|video",
  "url": "", "file": "files/<slug>/<name>.pdf" or null, "summary": "one sentence" }]`.
- `research/files/<slug>/` — reference material (not published to GitHub; synced to the private server):
  - PDFs of papers you cite where freely downloadable (arXiv: `https://arxiv.org/pdf/<id>`; SSRN often
    blocks bots — skip if so). Name: `<firstauthor>-<year>-<short-title>.pdf`, lowercase, dashes.
  - Markdown snapshots of pages that may change or vanish (Reddit/HN threads, blog posts, broker docs):
    `<site>-<short-title>.md` with the URL, date fetched, and the key content (quotes of the important
    parts, not whole pages).
  - Check every PDF is a real PDF (`file x.pdf`) and delete failed downloads.
- Write plainly: short sentences, numbers with units and periods, no hype. Say how confident you are.

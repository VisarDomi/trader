# Decisions & Reference

## Capital.com API Limits

Source: https://open-api.capital.com/ (re-checked 2026-10-07). All limits apply per login: every demo
account on it and every app using it (arena, lab, position-opener) share them.

| Limit | Value |
|-------|-------|
| API key generation | Max 100 attempts per 24h |
| General request rate | Max 10/sec per user |
| Position/order rate | Max 1 per 0.1s per user |
| **POST /session** | **1 req/sec per API key** |
| WebSocket session | **10 minutes** — must ping to keep alive |
| REST session | 10 minutes of inactivity, then error |
| WebSocket instruments | **Max 40 per subscription** |
| POST /positions (demo) | 1000/hour |
| POST /accounts/topUp | 10/sec, 100/day |
| Demo account balance | Max 100,000 |
| WebSocket streaming | Falls off on PUT /session (account switch) |
| Demo accounts per login | Not documented (live: one account + up to 10 sub-accounts) |

## Capital.com API Response Formats

Source: https://open-api.capital.com/

### POST /session (Authentication)

Request headers: `X-CAP-API-KEY`

```json
{ "identifier": "user@example.com", "password": "...", "encryptedPassword": false }
```

Response headers: `CST` (session token), `X-SECURITY-TOKEN` (account token) — both valid 10 min.

```json
{
  "accountType": "CFD",
  "accountInfo": { "balance": 92.89, "deposit": 90.38, "profitLoss": 2.51, "available": 64.66 },
  "currencyIsoCode": "USD",
  "currentAccountId": "12345678901234567",
  "streamingHost": "wss://api-streaming-capital.backend-capital.com/",
  "accounts": [
    {
      "accountId": "12345678901234567", "accountName": "USD", "preferred": true,
      "accountType": "CFD", "currency": "USD",
      "balance": { "balance": 92.89, "deposit": 90.38, "profitLoss": 2.51, "available": 64.66 }
    }
  ],
  "clientId": "12345678",
  "timezoneOffset": 3
}
```

### GET /markets

Query params: `searchTerm` (optional, e.g. "Bitcoin")

```json
{
  "markets": [
    {
      "epic": "AAPL", "instrumentName": "Apple Inc", "instrumentType": "SHARES",
      "bid": 150.25, "ofr": 150.35, "timestamp": 1660297190627, "expiry": "-"
    }
  ]
}
```

### GET /history/prices

Query params: `epic` (required), `resolution` (MINUTE, MINUTE_5, MINUTE_15, MINUTE_30, HOUR, HOUR_4, DAY, WEEK), `numPoints`, `from`, `to`

### WebSocket: marketData.subscribe

Connect to: `wss://api-streaming-capital.backend-capital.com/connect`

Request:
```json
{
  "destination": "marketData.subscribe", "correlationId": "1",
  "cst": "...", "securityToken": "...",
  "payload": { "epics": ["OIL_CRUDE", "AAPL"] }
}
```

Subscription confirmation:
```json
{
  "status": "OK", "destination": "marketData.subscribe", "correlationId": "1",
  "payload": { "subscriptions": { "OIL_CRUDE": "PROCESSED" } }
}
```

Live quote update (destination: `quote`):
```json
{
  "status": "OK", "destination": "quote",
  "payload": {
    "epic": "OIL_CRUDE", "product": "CFD",
    "bid": 93.87, "bidQty": 4976.0,
    "ofr": 93.9, "ofrQty": 5000.0,
    "timestamp": 1660297190627
  }
}
```

### WebSocket: OHLCMarketData.subscribe

Request:
```json
{
  "destination": "OHLCMarketData.subscribe", "correlationId": "3",
  "cst": "...", "securityToken": "...",
  "payload": { "epics": ["OIL_CRUDE"], "resolutions": ["MINUTE_5"], "type": "classic" }
}
```

Candlestick update (destination: `ohlc.event`):
```json
{
  "status": "OK", "destination": "ohlc.event",
  "payload": {
    "resolution": "MINUTE_5", "epic": "AAPL", "type": "classic", "priceType": "bid",
    "t": 1671714000000, "h": 134.95, "l": 134.85, "o": 134.86, "c": 134.88
  }
}
```

Resolutions: MINUTE, MINUTE_5, MINUTE_15, MINUTE_30, HOUR, HOUR_4, DAY, WEEK. Types: classic, heikin-ashi.

### WebSocket: ping

```json
{ "destination": "ping", "correlationId": "5", "cst": "...", "securityToken": "..." }
```

Response: `{ "status": "OK", "destination": "ping", "correlationId": "5", "payload": {} }`

---

## Decisions

### Where things run

- **Everything on the PC; Hetzner is only the public edge.** The arena, dashboard, forecaster, inspector,
  PostgreSQL and the lab jobs run on this PC (12 threads, 31 GB, RTX 3060), all inside `trader.slice` (50%
  CPU/RAM cap). The shared Hetzner server keeps only Caddy and Authelia for trader.veron3.space and forwards to
  the PC through the shared gateway. Services bind to 127.0.0.1 and talk over loopback, so the forecaster and
  the lab need no tunnel. The cost: the PC must stay on; when it is off, nothing trades or records and the
  dashboard is down. The arena's old copy on Hetzner holds stale data and must never be started.
- **SQLite for the arena, PostgreSQL for the lab.** The arena's store is small and single-writer, and SQLite
  needs no server process. The lab keeps the PostgreSQL candle store and the one compressed tick archive.

### Broker mirror across many demo accounts

- **Paper runs stay the leaderboard; real demo orders are a check on them.** Paper has no capacity limits and
  treats every agent the same; the mirror measures how far real fills drift from it.
- **Hedging mode instead of one account per agent.** Capital.com allows 10 demo accounts per login (the user
  keeps one). In netting mode an account can hold one run per instrument, so nine accounts would mirror only
  a small part of the live runs. In hedging mode every position is its own deal, closed by its deal id, so one account holds
  any number of runs on the same instrument (verified 2026-10-07: BUY, BUY, SELL on BTCUSD gave three positions,
  each closed separately; the mode can be switched with a position open).
- **Scale 0.2, 50 runs per account.** Each run reserves $2,000 of a $100,000 account: 450 runs across nine
  accounts. Smaller scales round more trades below minimum sizes (0.1: 1.3% of trades off by >10%), larger ones
  fit fewer runs (0.25: 360). At 0.2 a whole account only reaches its kill switch
  if its runs lose half their (scaled) capital on average, so the switch stays a runaway guard.
- **Accounts are found by name prefix and tracked by id.** The user adds capacity by naming an account
  "Arena…", without a deploy, and their own accounts can never be traded by accident. Names can change, so
  state is keyed by accountId and deals are re-attached by deal id.
- **One Capital session per account.** Nine concurrent sessions on the login were checked before relying on
  them (`src/arena/main.ts`, `sessionFor`). No session switches between accounts, so an order never waits for
  another account's jobs; each account has its own job queue, orders first.
- **Request budget.** From the backtest trade logs (2.75 years): 3 orders in a typical active minute, 34 at
  p99, 61 at p99.9, 108 at the worst minute; at most ~105 opens in any hour against the demo limit of 1,000.
  All sessions and the candle poller share the arena's ~6 req/s pacer, where orders take the next free slot and
  confirmations follow; new positions are checked by the account's next reconciliation, not one request per
  order. Top-of-hour bursts take about 0.35 s per order (see `agents/LIFECYCLE.md`, twins). The rest of the
  login's 10 req/s is left to the lab (≤3.3/s) and position-opener. Beyond the 450-run capacity only the best
  runs are mirrored (promotion by daily t-statistic); a second Capital.com login would bring its own limits.

### Leverage tiers

- **Leverage is a dimension of every run, one tier per demo account.** The user's login offers 1, 2, 3, 4, 5,
  10, 20, (30 on FX), 50, 100 and 200 on indices, commodities and FX, and up to 20 on crypto and shares; it is
  set per account and asset class (`PUT /accounts/preferences {leverages}`), and a position keeps the
  leverage it was opened with (verified: changing an account with open positions left them at their old
  leverage). Nine accounts, nine tiers: 1, 2, 3, 5, 10, 20, 50, 100, 200 (4 and 30 left out; 30 exists only
  on FX). Mirroring a run only on an account of its tier keeps every demo deal at its paper run's leverage.
- **The paper engine models what leverage changes:** the margin cap on size, the 50%-of-margin close-out,
  and no overnight funding at 1:1 on anything except natural gas.
- **Leverage is a ceiling, not a multiplier.** Agents that risk 1% against a stop used a median of 0.7–3×
  and a 90th percentile of 1.5–5× equity in backtests (FX the most), so the account leverage changes their
  results only on the low tiers (at 1:1 89% of index and 99% of FX trades would be capped). The starting
  allocation therefore sorts agents by their backtest leverage use, the least on 1:1 and the most on 1:200,
  ~50 runs per account. To show what *using* leverage does, `marginPct` sizing (a share of equity put up as
  margin, so exposure grows with the tier) and a control agent, the leverage ladder, run one signal at
  every tier.
- **Shares: the biggest companies against the index.** The eight largest Nasdaq-100 companies trade at 1:1
  next to US100 and US500 in buy-and-hold. Their minimum sizes are small enough (0.01–0.1 share) to mirror at
  0.2×.
- **At 1:1 nothing but natural gas pays funding.** Capital.com's fees page says 1:1 positions on "most
  markets" pay no overnight fee (exceptions: natural gas, US cocoa, VIX, TRY pairs). Arena 01's transactions
  (8–12 October 2026) confirmed it: funding only on NATURALGAS, none on its US100, US500, US30, GOLD, SILVER,
  OIL_CRUDE and FX positions, while Arena 06 (1:20) paid on all of them. The engine exempts every 1:1
  position except NATURALGAS. Index dividend adjustments (credited to longs, charged to shorts, seen on Arena
  01) are recorded from Capital's transactions but not simulated by the paper engine.
- **Candidates are compared with monkeys on t, not return,** because returns scale with position size and so
  with leverage; a t-statistic does not.
- **The roster decides tiers, not agent files,** so moving an agent between tiers never changes its code
  hash.

### Lifecycle and babysitting

- **Judged on daily returns, not trade counts or backtests.** One return per weekday, flat days included,
  measures a strategy that trades ten times a day and one that trades twice a month in the same unit; 30
  trades took the fastest tenth of strategies 38 days and would take the slowest tenth 3.5 years. The evidence
  in a record is about its Sharpe ratio × √years whatever its trade count. A record is judged from 10 closed
  trades and 42 days (30 weekdays); the trade floor keeps one long-held position from counting as 30
  decisions. Retire at a daily t of −1 after 30 trades (10 over 90 days): an agent without an edge pays the
  spread on every trade, so its t drifts negative, while a real edge rarely shows t ≤ −1.
- **Candidate and confirmed are separate claims.** A daily t ≥ 2 above every monkey on the instrument makes a
  candidate for Capital demo slots: cheap to be wrong about, and wrong for about one no-edge record in six
  within a year when checked daily. Confirmed means an edge and needs three things: an e-value (evidence
  that stays valid however often it is read), the e-BH bar over every strategy record ever started at a 10%
  false discovery rate, and a forward record that agrees with its backtest. The bar for one record alone
  (t 3.0–3.7) would in time let several lucky ones through among 844 records; counting them all puts it
  near 4.6 and roughly doubles the track record needed, the honest price of having tried 844.
- **Volatility never below the backtest's.** A short record of small steady wins has not yet shown its
  losses: the martingale monkey, a no-edge control, had a daily t of 5.2 after 31 weekdays on its own
  volatility and 1.2 on its backtest's.
- **The policy lives in shared code** (`packages/shared/src/lifecycle.ts`) so the dashboard and the
  babysitter's review never disagree.
- **Retiring a single instrument goes through `agents/roster.json`,** because editing the agent's
  instrument list would change its code hash and restart every other instrument's record.
- **Promotion to the broker is by daily t-statistic with a 0.25 margin** (`PROMOTION_MARGIN` in
  `src/arena/broker.ts`), counted on the weekdays since the run's last demotion, applied only when a tier's slots
  are full and only while the weaker run is flat, so the mirror never cuts a trade short and does not churn on
  noise.
- **Deterministic watchdog, judgement on a schedule.** Outages need minutes, not days: a 10-minute timer on
  the PC checks the arena, the feeds, the broker accounts and the lab services and notifies the desktop
  (after three failed checks for transient things). Retiring and adding agents needs judgement and evidence
  accumulates slowly, so Claude visits on a schedule from a T3 Code scheduled task. The owner sets that
  schedule from the results: up to once a day when the last visit found bugs, down to once a week after a
  quiet period. New agents are added at most every seven days. Visits post into the thread that built the
  platform (fresh threads would need a git worktree of the T3 project root, which is not a repository);
  the runbook and the journal, not the thread's memory, are the source of truth.

### Live data

- **Bars from the quote stream, REST candles for history.** Forward agents decide on bars built from the
  delivered quotes, the same tick path the backtests replay, so decisions, protections and fills share one
  model. A minute closes on the first quote stamped in a later minute, or after 1.5 × the smoothed feed delay
  when the market is quiet, so live candles match Capital's (see `EXECUTION.md`). REST `/prices` is still polled
  10 s past each minute into the arena's candle store: it heals gaps for warm-up and history, but never rewrites
  a live path already observed.
- **Candle stop checks only for minutes that started after the entry**, because in live mode a candle for the
  minute in which an order filled arrives after the fill.

- **Daily history for long lookbacks.** The arena keeps 120 days of 1-minute candles, so an
  agent with a 200-day average or a 12-month return would wait months for its first trade. Rather than keep
  a year of 1-minute candles in the arena, the lab pushes daily bars built from its own 1-minute
  history (`push-history`, nightly), and the arena seeds each 1d series with the ones older than its
  1-minute window when it starts. Same construction as the backtests; only 1d series, which is what the
  long-lookback agents use.

### Capital.com quirks observed

- The stored US500 minute tape starts at 2024-01-01 23:01 UTC. Read-only demo API probes on 2026-10-15
  returned no minute bars in sampled trading windows in 2015, 2020, 2022 or 2023, but returned January
  2024 minutes, 2023 hourly bars and 2015 daily bars. This establishes the observed US500 data boundary,
  not a documented universal retention rule or when Capital changed access. US100 minutes preserved
  from an earlier ingest begin on 2020-02-11. The archived Windows US100 downloader requests from
  2017-05-01; that requested start alone does not prove which older quotes were successfully stored.
- The first `/accounts` call after creating or switching a session can report a balance of 0. Never use a single
  reading for decisions (the broker kill switch needs two).
- `POST /positions` confirmation: the position's id is `affectedDeals[0].dealId`, not the confirmation's `dealId`.
- `GET /confirms/{dealReference}` returns the account's **latest** confirmation whenever the reference is not the
  latest one, and echoes the requested reference back (verified 2026-10-15: references of a dozen older deals all
  returned the same US500 close). If a broker-side stop fills between our order and our confirm call, we get that
  stop's confirmation. The broker accepts a confirmation only when its epic, direction, size and deal id match
  the deal; otherwise reconcile settles the deal from `/positions`.
- A confirmation's `direction` is the **order's** direction: a close of a long confirms as `SELL`, of a short as
  `BUY` (verified with a minimum-size round trip on Arena 01, 2026-11-09; the close reference is
  `p_<position dealId>`). The broker checks a close's confirmation against the opposite of the position's
  direction. Closes recorded without exit prices are explained in `CHANGELOG.md`.
- `PUT /session` (account switch) changes the active account **of that session only** (verified: another session
  switching to Visi left the broker session on Arena 03). It does, however, move the login-wide `preferred` account,
  which is where *new* logins land; apps that remember their last account (position-opener does) are unaffected.
  The broker verifies its session's account after every switch and every re-login.
- Overnight funding is charged at 17:00 New York (21:00 UTC in summer); the daily break for US indices is 5 minutes.
- Account leverage is per asset class and is stamped on each position when it opens (`position.leverage`);
  `GET /markets/{epic}` keeps reporting the default margin factor whatever the account's setting. Some
  instruments stop below the class setting: NATURALGAS opened at 1:149 on the 1:200 account (2026-10-07). The
  paper engine uses the class setting; this matters only for agents sizing with `marginPct` on such instruments.

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

### Implications for Tick Recorder (v1; the recorder and its tables were removed 2026-10)

- **WebSocket 10-min timeout**: We ping every 60s. Should be plenty but if Capital.com
  is strict about it, we may need to lower to 30s or check that pings actually extend
  the session.
- **POST /session at 1/sec**: Our reconnect re-authenticates. With 3s backoff that's
  fine, but rapid retries could trigger 429. We use exponential backoff for auth failures.
- **40 instrument limit**: We can subscribe to US100 + BTCUSD (and more) on a single
  WebSocket connection. No need for multiple connections.
- **REST session 10-min expiry**: The keep-alive timer in CapitalSession pings every 5min,
  which keeps the REST session alive. If the REST session expires, we re-auth before
  the next WebSocket connect anyway.

## Tick Stats Strategy (v1, removed 2026-10)

- **Decision**: Maintain exact per-instrument tick stats incrementally during tick ingest,
  instead of recomputing them from `ticks` each time `tick-stats` runs.
- **Why**: The old approach required PostgreSQL to scan the full `ticks` table for exact
  `COUNT(*)`, `MIN(timestamp)`, and `MAX(timestamp)` values grouped by instrument. That
  cost grows with retained history and turns a lightweight operator CLI into a CPU-heavy
  database job.
- **Why not just add indexes**: Indexes help point lookups and range filters, but they do
  not make an exact grouped count across the whole table cheap enough. PostgreSQL still
  has to touch essentially all rows.
- **Why not use a materialized view**: A materialized view would only move the same full
  scan to refresh time. That is acceptable for scheduled reporting, but not for a command
  that should stay cheap and safe to run on demand.
- **Tradeoff accepted**: We take a small amount of extra write-path bookkeeping in exchange
  for keeping operator stats reads effectively constant-cost as tick history grows.

## v2 decisions (2026-10)

### Where things run

- **Arena on Hetzner, heavy work on the lab PC.** The shared server has ~2 GB free RAM and 4 cores used by
  other apps, which is plenty for the live loop (~150-250 MB) but not for backtests, ingest or TimesFM.
  The PC (12 threads, 31 GB, RTX 3060) runs those inside `trader.slice` (50% CPU/RAM cap). An SSH tunnel
  (`-R 4130` forecaster, `-L 4120` arena API) is the only link; both services bind to 127.0.0.1.
- **SQLite for the arena, PostgreSQL for the lab.** The arena's store is small and single-writer; SQLite needs
  no server process on a crowded machine. The lab keeps the existing PostgreSQL candle store.

### Broker mirror across many demo accounts

- **Paper runs stay the leaderboard; real demo orders are a check on them.** Paper has no capacity limits and
  treats every agent the same; the mirror measures how far real fills drift from it.
- **Hedging mode instead of one account per agent.** Capital.com allows 10 demo accounts per login (the user
  keeps one). In netting mode an account can hold one run per instrument, so 9 accounts would mirror at most
  108 of 392 runs. In hedging mode every position is its own deal, closed by its deal id, so one account holds
  any number of runs on the same instrument (verified 2026-10-07: BUY, BUY, SELL on BTCUSD gave three positions,
  each closed separately; the mode can be switched with a position open).
- **Scale 0.2, 50 runs per account.** Each run reserves $2,000 of a $100,000 account: 450 runs across nine
  accounts. Smaller scales round more trades below minimum sizes (0.1: 1.3% of trades off by >10%), larger ones
  fit fewer runs (0.25: 360, fewer than the 392 live runs). At 0.2 a whole account only reaches its kill switch
  if its runs lose half their (scaled) capital on average, so the switch stays a runaway guard.
- **Accounts are found by name prefix and tracked by id.** The user adds capacity by naming an account
  "Arena…", without a deploy, and their own accounts can never be traded by accident. Names can change (the
  first nine "Arena" accounts were renamed from older ones), so state is keyed by accountId and deals are
  re-attached by deal id.
- **One session switching accounts, not one session per account.** The number of concurrent sessions a login
  may hold is undocumented, and a cap would knock out the stream or position-opener. Switching costs two
  requests per account change; jobs are grouped per account so a burst switches at most nine times.
- **Request budget.** From the backtest trade logs (392 runs, 2.75 years): 3 orders in a typical active
  minute, 34 at p99, 61 at p99.9, 108 at the worst minute; at most ~105 opens in any hour against the demo
  limit of 1,000. At ~2.6 requests per order plus switches, the arena's 6 req/s pacer clears a p99 burst in
  ~20 s and the worst one in about a minute, leaving the rest of the login's 10 req/s to the lab (≤3.3/s)
  and position-opener. Beyond the 450-run capacity, or ~100 agent variants, mirror only the best demo runs
  (the assignment already fills best-first) or use a second Capital.com login with its own limits.

### Lifecycle and babysitting

- **Judged on demo trades, not backtests or calendar time alone.** A run needs 30 closed trades and 4 weeks
  (slow agents: 90 days and 10 trades) before any verdict. Retire at a trade t-statistic of −1: an agent
  without an edge pays the spread on every trade, so its t drifts negative, while a real edge rarely shows
  t ≤ −1 after 30 trades. Leaders need t ≥ 2 and a return above every monkey on the instrument; the
  monkeys double as a check on the bar itself.
- **The policy lives in shared code** (`packages/shared/src/lifecycle.ts`) so the dashboard and the
  babysitter's review never disagree.
- **Retiring a single instrument goes through `agents/roster.json`,** because editing the agent's
  instrument list would change its code hash and restart every other instrument's record.
- **Promotion to the broker is by demo equity with a $200 margin,** applied only when slots are full and
  only while the weaker run is flat, so the mirror never cuts a trade short and does not churn on noise.
- **Deterministic watchdog, judgement on a schedule.** Outages need minutes, not days: a 10-minute timer on
  the PC checks the arena, the feeds, the broker accounts and the lab services and notifies the desktop
  (after three failed checks for transient things). Retiring and adding agents needs judgement and evidence
  accumulates slowly, so Claude visits twice a week (Monday: full cycle including new agents; Thursday:
  health and retirements) from a T3 Code scheduled task. Visits post into the thread that built the
  platform (fresh threads would need a git worktree of the T3 project root, which is not a repository);
  the runbook and the journal, not the thread's memory, are the source of truth.

### Live data

- **1-minute candles from REST, quotes from WebSocket.** Building candles from WebSocket ticks made the demo bars
  differ from the REST history the backtests use and left gaps after disconnects. Polling `/prices` at :10 past
  each minute (12 requests/min) gives identical data in both modes and heals gaps automatically. Ticks are still
  used for tick-precision stops and real fill prices.
- **Candle stop checks only for minutes that started after the entry**, because in live mode a candle for the
  minute in which an order filled arrives after the fill.

### Capital.com quirks observed

- Minute history on both demo and live API starts at 2024-01-01 (rolling window). US100 data from 2020 came from
  an earlier ingest and is kept.
- The first `/accounts` call after creating or switching a session can report a balance of 0. Never use a single
  reading for decisions (the broker kill switch needs two).
- `POST /positions` confirmation: the position's id is `affectedDeals[0].dealId`, not the confirmation's `dealId`.
- `PUT /session` (account switch) changes the active account **of that session only** (verified: another session
  switching to Visi left the broker session on Gerti). It does, however, move the login-wide `preferred` account,
  which is where *new* logins land; apps that remember their last account (position-opener does) are unaffected.
  The broker verifies its session's account after every switch and every re-login.
- Overnight funding is charged at 17:00 New York (21:00 UTC in summer); the daily break for US indices is 5 minutes.

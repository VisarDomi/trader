# Decisions & Reference

## Capital.com API Limits

Source: https://open-api.capital.com/

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

### Implications for Tick Recorder

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

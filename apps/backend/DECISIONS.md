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

# Trade inspection

A separate, read-only Bun process reconstructs a selected trade from the canonical compressed
PostgreSQL archive and the bounded local transfer spool. It does not issue Capital requests or run
on the arena's quote-processing thread. PostgreSQL queries run inside READ ONLY transactions;
SQLite connections open read-only. No raw quote files or second archive are created.

`trader-inspector.service` runs in trader.slice. GET /inspection?id=<run>&trade=<idx|open>&stage=
<virtual|capital|backtest> returns bid/ask, minute fallback candles, executable-price P&L, spread,
drawdown, costs, recorded decisions and coverage. GET /preview returns the latest two closed trades.
The UI proxies these reads; native access retains the dedicated device-key allowlist.

Calculations use all valid scanned quotes; only rendered series are thinned while preserving extrema.
Seven-day / 250,000-quote / 1,600-block limits explicitly mark partial coverage. Capture gaps remain
visible; minute candles do not establish exact intraminute drawdown. Funding is a recorded terminal
amount, not an invented accrual path. Capital funding/paid spread remains unknown when unallocated;
its observed public quotes are not asserted to be broker execution quotes. Capital position-risk
percentages are not inferred from shared account margin. Reasons come from stored instructions.

The memory-only response cache is capped at twelve entries / 16 MiB. Requests coalesce and serialize;
no background scans are performed. Closed-trade responses expire after five minutes, open after ten
seconds. Reboot recovery uses the same databases and stable trade indices, with no writable migration
or strategy admission in this service.

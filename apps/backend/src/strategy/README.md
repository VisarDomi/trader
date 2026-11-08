# Strategy context

`evidence.ts` is a pure, version-pinned presentation adapter for the 46 current strategy families
(66 variants). It receives the same closed bars, cached SDK indicators, parameters, state and
forecast seen when a standard run requests entry. It returns pre-entry panels, thresholds, exact
operators, signed headroom, an exit plan and initial protections. Random and passive controls are
explicitly described. OR conditions are not displayed as mandatory AND conditions.

`versions.json` pins reviewed source hashes/timeframes. Unreviewed versions fail closed to an
unavailable explanation; source changes never silently reuse old assumptions. The agent SDK and
agent source hashes are unchanged. New agents should get an adapter and tests with their source pin.

The optional engine observer runs only at entry requests; forecast adapters take a few scalar
pre-callback state values when needed. It does not place orders, advance RNG or mutate indicators,
bars, state or parameters. Errors are isolated from orders. Comparison copies have no observer.
SQLite `decision_frames` keeps one gzip-compressed derived frame per standard request, linked to
its exact fill time. Frames are at most 24 KiB before compression, four panels, 72 sampled points per
series, 16 conditions. They survive arena restarts, including pending-command restoration. This is
small decision evidence, not another raw tick archive. Unfilled requests are not shown as trades.

`history.ts` provides explicitly reconstructed context when an old frame is missing. Reads are
bounded and read-only: at most 500 days, 1,200 aggregated bars/timeframe and 100,000 local minutes;
PG reads disable query parallelism and have a six-second statement deadline. The arena's existing
REST-before-feed-cutover / stream-after-cutover bars take precedence, with daily seeds for long
filters. No candle ending after the decision is included. Missing forecast payloads, allocation,
swing/noise state and unknown decision timing stay explicit. A reconstruction may disagree with the
recorded decision and is never relabeled as retained input. No new forecast is generated for the past.

Night context reconstructs the exact reviewed session feature formulas: 09:30–16:00 New York,
15-minute checkpoints, move, efficiency, directional share, conservative retrace, range/body,
coverage and policy/calendar eligibility; then the prior 22:00 reference and 03:27 pullback in Tirana.
The inspector cache/serialization queue and trader.slice limits apply to on-demand reconstruction.

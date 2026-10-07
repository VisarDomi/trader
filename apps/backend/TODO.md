# TODO — trader platform (v2)

## Watch (first weeks)

- [ ] Demo: confirm every instrument trades through a full week (weekend gap, daily breaks, DST change on 2026-11-01).
- [ ] Broker mirror: compare broker vs paper fills once ~20 deals have closed; calibrate `typicalSpread` and
      add slippage to the simulation if the gap is systematic.
- [ ] Broker mirror: watch the first top-of-hour bursts with all 392 runs mirrored (queue length on the
      Broker page, 429s in the events).
- [ ] Beyond 450 runs (9 accounts × 50) only the best demo runs are mirrored (promotion by demo equity);
      a second Capital.com login would add 10 more accounts and its own request budget.
- [ ] First judgements around early November: check the monkey sanity line and the retire reasons make sense.
- [ ] Arena memory on the shared server (currently ~150-210 MB; cap 700 MB).

## Next

- [ ] Demo ranking score that accounts for sample size (e.g. probabilistic Sharpe ratio) instead of raw return.
- [ ] Walk-forward backtests: re-run the backtest on a rolling window and show stability across windows.
- [ ] Multi-instrument agents (pairs / relative value) and portfolio-level agents.
- [ ] TimesFM covariates: feed related instruments (US500 for US100, DXY proxies for FX) as past covariates.
- [ ] Learned agents: train small models on the lab GPU, export weights as JSON for TypeScript inference.
- [ ] Notifications (Telegram) for kill switch, arena down, forecaster down.
- [ ] Volume: Capital.com tick volume is stored; no agent uses it yet.

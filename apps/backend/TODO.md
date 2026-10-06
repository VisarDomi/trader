# TODO — trader platform (v2)

## Watch (first weeks)

- [ ] Demo: confirm every instrument trades through a full week (weekend gap, daily breaks, DST change on 2026-11-01).
- [ ] Gerti mirror: compare broker vs paper fills once ~20 deals have closed; calibrate `typicalSpread` and
      add slippage to the simulation if the gap is systematic.
- [ ] Rotate the mirrored runs to the best *demo* performers once rows have ~30 trades.
- [ ] Arena memory on the shared server (currently ~150-210 MB; cap 700 MB).

## Next

- [ ] Demo ranking score that accounts for sample size (e.g. probabilistic Sharpe ratio) instead of raw return.
- [ ] Walk-forward backtests: re-run the backtest on a rolling window and show stability across windows.
- [ ] Multi-instrument agents (pairs / relative value) and portfolio-level agents.
- [ ] TimesFM covariates: feed related instruments (US500 for US100, DXY proxies for FX) as past covariates.
- [ ] Learned agents: train small models on the lab GPU, export weights as JSON for TypeScript inference.
- [ ] Notifications (Telegram) for kill switch, arena down, forecaster down.
- [ ] Volume: Capital.com tick volume is stored; no agent uses it yet.
- [ ] Old v1 PostgreSQL tables (`runs`, `fills`, `equity_snapshots` ~1.7 GB, `ticks` 4.4 GB) are unused by v2;
      decide whether to drop them.

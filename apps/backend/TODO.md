# TODO — trader platform

## Watch

- [ ] Arena memory as the run count grows (`bun run review` shows it; about 435 MB at 4,600 runs). The arena
      runs inside `trader.slice` with no service-level memory cap of its own.
- [ ] Capital capacity: 450 slots (9 accounts × 50) are filled best-first by trade t-statistic; a second
      Capital.com login would add 10 more accounts and its own request budget.

## Next

- [ ] Demo ranking score that accounts for sample size (e.g. probabilistic Sharpe ratio) instead of raw return.
- [ ] Walk-forward backtests: re-run the backtest on a rolling window and show stability across windows.
- [ ] Multi-instrument agents (pairs / relative value) and portfolio-level agents.
- [ ] TimesFM covariates: feed related instruments (US500 for US100, DXY proxies for FX) as past covariates.
- [ ] Learned agents: train small models on the lab GPU, export weights as JSON for TypeScript inference.
- [ ] Phone notifications (Telegram) for kill switch, arena down, forecaster down; the watchdog notifies only
      this PC's desktop.
- [ ] Volume: Capital.com tick volume is stored; no agent uses it yet.

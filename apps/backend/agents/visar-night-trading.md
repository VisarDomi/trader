# Visar Night (`visar-night` & `visar-night-control`)

Unified NY-clock overnight strategy family on `US500` and `US100`.

- **Signal variants (`visar-night`, hash `28863ccbaed2`):** 8 symmetric rules trading both `US500` and `US100` (16 runs):
  - `visar-night/full-day-200` — 09:30–16:00 NY session, 16:00 bid pullback, 1:200 (`Arena 09`). Direct symmetric successor to the original US500 rule on both `US500` and `US100`.
  - `visar-night/midday-200` — 09:30–13:00 NY midday session, 13:00 bid pullback, 1:200 (`Arena 09`).
  - `visar-night/midday-20` — 09:30–13:00 NY midday session, 13:00 bid pullback, 1:20 (`Arena 06`).
  - `visar-night/full-day-20` — 09:30–16:00 NY session, 16:00 bid pullback, 1:20 (`Arena 06`).
  - `visar-night/no-pullback-20` — 09:30–13:00 NY midday, no 13:00 pullback required, 1:20 (`Arena 06`).
  - `visar-night/loose-body-20` — 09:30–13:00 NY midday, relaxed body/range `≥40%`, 1:20 (`Arena 06`).
  - `visar-night/any-day-20` — 09:30–13:00 NY midday, any direction `≥0.25%` (path filters off), 1:20 (`Arena 06`).
  - `visar-night/every-night-20` — 09:30–13:00 NY midday, enters every Mon–Thu night (direction + pullback filters off), 1:20 (`Arena 06`).
- **Direction controls (`visar-night-control`, hash `733289eff182`):** 2 controls on both `US500` and `US100` (4 runs):
  - `visar-night-control/always-long` — 1:20 (`Arena 06`).
  - `visar-night-control/random-direction` — 1:20 (`Arena 06`).

All 20 runs enter at **21:27 NY** (Mon–Thu, 1-minute expiry at 21:28), exit at **02:27 NY**, skip FOMC/BOJ decision days (calendar verified through 2027-12-31), size at 90% margin with a 50% equity stop, and are tracked together in `/night-lab/index.html` (`research/night-cohort-v5-20261125.json`).

Full research details, backtest tables, and calibration notes live in [`research/strategies/visar-night.md`](../../../research/strategies/visar-night.md) and [`LIFECYCLE.md`](LIFECYCLE.md).

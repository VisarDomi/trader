# Trader forecaster

Google TimesFM 3 (330M parameters, zero-shot) served over HTTP on the lab PC's GPU (RTX 3060 12 GB;
it uses ~1.3 GB of VRAM and does ~140 forecasts/s at context 512). Repo-wide map and hard rules:
[`../../setup.md`](../../setup.md). How agents use it: [`../backend/agents/GUIDE.md`](../backend/agents/GUIDE.md#timesfm-forecasts).

## API (`server.py`, 127.0.0.1:4130)

- `GET /health`
- `POST /forecast` `{"horizon": 16, "series": [[close, ...], ...]}` →
  `{"mean": [[...]], "quantiles": [[[q10 steps], ..., [q90 steps]], ...]}` (quantile levels 0.1…0.9;
  `mean` is the median).

Callers: the arena (live, through the `trader-tunnel` reverse forward) and `bun run forecasts`
(backtest precompute, writes tables under `apps/backend/data/forecasts`).

## Run

```sh
uv sync                                   # Python 3.12 venv in .venv with timesfm[torch]==3.0.2
.venv/bin/python server.py                # by hand; normally trader-forecaster.service (ops/lab)
```

Env: `FORECASTER_HOST`, `FORECASTER_PORT`, `FORECASTER_BATCH` (the service uses 256),
`FORECASTER_SYMMETRIC=1` (TimesFM's symmetric-input option; off by default).
The first start downloads the model from Hugging Face (`google/timesfm-3.0-pytorch`).

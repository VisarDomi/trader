"""TimesFM 3 forecast service for the trader platform.

Runs on the lab PC's GPU. The arena (via SSH tunnel) and the backtest
precompute job call it over HTTP:

  GET  /health
  POST /forecast   {"horizon": 64, "series": [[close, close, ...], ...]}
       -> {"model": ..., "mean": [[...]], "quantiles": [[[q10 steps], ..., [q90 steps]], ...]}

"mean" is TimesFM's point forecast (the median). Quantile levels are 0.1..0.9.
Requests are serialized on one model instance (one GPU).
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch
from timesfm3 import TimesFM3Forecaster

MODEL_ID = "google/timesfm-3.0-pytorch"
HOST = os.environ.get("FORECASTER_HOST", "127.0.0.1")
PORT = int(os.environ.get("FORECASTER_PORT", "4130"))
BATCH = int(os.environ.get("FORECASTER_BATCH", "64"))
MAX_SERIES = 4096
MAX_HORIZON = 256
MAX_CONTEXT = 4096
# Mirror each context (x and -x) and average: TimesFM 3's benchmark setting.
SYMMETRIC = os.environ.get("FORECASTER_SYMMETRIC", "0") == "1"

_lock = threading.Lock()
_stats = {"requests": 0, "series": 0, "seconds": 0.0, "started": time.time()}


def load_model() -> TimesFM3Forecaster:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    t0 = time.time()
    model = TimesFM3Forecaster.from_pretrained(MODEL_ID, device=device, per_core_batch_size=BATCH)
    print(f"loaded {MODEL_ID} on {device} in {time.time() - t0:.1f}s (batch {BATCH}, symmetric={SYMMETRIC})", flush=True)
    return model


MODEL = load_model()


def forecast(series: list[list[float]], horizon: int) -> dict:
    contexts = [np.asarray(s, dtype=np.float32)[-MAX_CONTEXT:] for s in series]
    with _lock:
        t0 = time.time()
        outs = list(
            MODEL.predict_batch(
                contexts=contexts,
                horizon=horizon,
                return_quantiles=True,
                use_symmetric_averaging=SYMMETRIC,
            )
        )
        dt = time.time() - t0
        _stats["requests"] += 1
        _stats["series"] += len(series)
        _stats["seconds"] += dt
    mean = [o.forecast.astype(float).round(6).tolist() for o in outs]
    # o.quantiles is [horizon, levels]; send [levels][horizon].
    quantiles = [o.quantiles.T.astype(float).round(6).tolist() for o in outs]
    return {"model": MODEL_ID, "mean": mean, "quantiles": quantiles, "seconds": round(dt, 4)}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send(200, {
                "ok": True,
                "model": MODEL_ID,
                "device": str(MODEL.device),
                "symmetric": SYMMETRIC,
                "stats": _stats,
                "gpuMemoryMb": round(torch.cuda.memory_allocated() / 1e6) if torch.cuda.is_available() else 0,
            })
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/forecast":
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length))
            series = body["series"]
            horizon = int(body.get("horizon", 64))
            if not isinstance(series, list) or not series or len(series) > MAX_SERIES:
                raise ValueError(f"series must be a non-empty list of at most {MAX_SERIES} arrays")
            if not 1 <= horizon <= MAX_HORIZON:
                raise ValueError(f"horizon must be 1..{MAX_HORIZON}")
            if any(len(s) < 2 for s in series):
                raise ValueError("each series needs at least 2 points")
            self._send(200, forecast(series, horizon))
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as err:
            self._send(400, {"error": str(err)})
        except Exception as err:  # noqa: BLE001 - report model failures to the caller
            print(f"forecast failed: {err!r}", file=sys.stderr, flush=True)
            self._send(500, {"error": repr(err)})

    def log_message(self, fmt: str, *args) -> None:
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"forecaster listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()

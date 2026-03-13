-- Trader Backend Database Schema

-- ============================================
-- MARKET DATA (shared across all runs)
-- ============================================

-- Minute OHLC candles, foundation for all timeframes
CREATE TABLE IF NOT EXISTS candles (
    instrument  TEXT        NOT NULL,
    timestamp   BIGINT      NOT NULL,   -- candle time (ms since epoch)
    open        NUMERIC     NOT NULL,
    high        NUMERIC     NOT NULL,
    low         NUMERIC     NOT NULL,
    close       NUMERIC     NOT NULL,
    PRIMARY KEY (instrument, timestamp)
);

-- Index for efficient date range queries in backtesting
CREATE INDEX IF NOT EXISTS idx_candles_instrument_time
    ON candles (instrument, timestamp ASC);

-- Raw ticks recorded from live sessions (future use)
CREATE TABLE IF NOT EXISTS ticks (
    instrument  TEXT        NOT NULL,
    timestamp   BIGINT      NOT NULL,   -- ms precision
    bid         NUMERIC     NOT NULL,
    ask         NUMERIC     NOT NULL,
    PRIMARY KEY (instrument, timestamp)
);

-- ============================================
-- RUN DATA (per agent run)
-- ============================================

CREATE TABLE IF NOT EXISTS runs (
    id              TEXT        PRIMARY KEY,
    agent_id        TEXT        NOT NULL,
    agent_name      TEXT        NOT NULL,
    mode            TEXT        NOT NULL,   -- backtest | paper | live
    status          TEXT        NOT NULL DEFAULT 'pending',
    capital         NUMERIC     NOT NULL,
    instrument      TEXT        NOT NULL,
    config          JSONB       NOT NULL,
    started_at      BIGINT,
    completed_at    BIGINT,
    metrics         JSONB
);

CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs (agent_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs (status);

CREATE TABLE IF NOT EXISTS fills (
    id              SERIAL      PRIMARY KEY,
    run_id          TEXT        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    action          TEXT        NOT NULL,   -- OPENED | CLOSED
    reason          TEXT        NOT NULL,   -- ORDER | STOP_LOSS | TAKE_PROFIT | MARKET_CLOSE | LIQUIDATION
    side            TEXT        NOT NULL,   -- BUY | SELL
    size            NUMERIC     NOT NULL,
    price           NUMERIC     NOT NULL,
    pnl             NUMERIC,
    timestamp       BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fills_run ON fills (run_id, timestamp ASC);

CREATE TABLE IF NOT EXISTS equity_snapshots (
    run_id          TEXT        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    timestamp       BIGINT      NOT NULL,
    equity          NUMERIC     NOT NULL,
    balance         NUMERIC     NOT NULL,
    PRIMARY KEY (run_id, timestamp)
);

CREATE TABLE IF NOT EXISTS agent_states (
    run_id          TEXT        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    timestamp       BIGINT      NOT NULL,
    state           JSONB       NOT NULL,
    PRIMARY KEY (run_id, timestamp)
);

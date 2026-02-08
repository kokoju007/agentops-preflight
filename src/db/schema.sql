-- Enable WAL mode for concurrent read/write
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

-- Network health snapshots from worker
CREATE TABLE IF NOT EXISTS net_health_snapshots (
    ts TEXT NOT NULL,
    rpc_ok_rate_1m REAL NOT NULL,
    rpc_error_rate_1m REAL NOT NULL,
    rpc_p95_ms_1m REAL NOT NULL,
    priority_fee_level REAL,
    tx_fail_rate_1m REAL,
    rpc_error_rate_trend_ratio REAL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_net_health_ts ON net_health_snapshots(ts);

-- Preflight evaluation logs
CREATE TABLE IF NOT EXISTS preflight_logs (
    run_id TEXT PRIMARY KEY,
    computed_at TEXT NOT NULL,
    payer TEXT,
    payment_tx TEXT,
    rule_set_version TEXT NOT NULL,
    request_json TEXT NOT NULL,
    response_json TEXT NOT NULL,
    risk_score INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_preflight_computed_at ON preflight_logs(computed_at);

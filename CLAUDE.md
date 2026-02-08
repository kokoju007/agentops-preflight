# CLAUDE.md — AgentOps Preflight v1 (확정본)

## Goal

Build AgentOps Preflight v1 (Solana) with x402 v2 paywall.
Two paid endpoints + one free demo endpoint.

## Hard Constraints (do not change)

- Node.js + TypeScript + Express
- x402 v2 packages: @x402/core@^2.3.0 + @x402/express@^2.3.0 + @x402/svm@^2.3.0.
  Implement using these packages only. Do NOT code alternative fallback paths.
  If @x402 packages fail to install or work, STOP and report to user.
  Document fallback options (x402-solana npm, native implementation) in README only.
- API does NOT do expensive work (simulateTransaction, heavy DB queries) for unpaid requests.
- No recommendation/severity/proceed/review/delay fields in responses. Ever.
- simulateTransaction failure => return HTTP 200 with partial evaluation.
- Request schema: { tx_base64: string } — nothing else.
- Request body size limit: 64kb (Express body-parser limit). Reject larger with 400.
- SQLite: enable WAL mode and set busy_timeout=5000 on connection init (worker + API write concurrently).
- /tx/preflight NEVER returns 503. Always 200 (with partial=true if simulate fails).
- flags array ALWAYS contains all 5 rules (A1, A3, B1, B2, C1), regardless of triggered/skipped/passed state.
- Response schema (fixed):

```json
{
  "request_id": "uuid",
  "computed_at": "ISO8601",
  "rule_set_version": "rev-final-1.0.0",
  "risk_score": 0,
  "partial": false,
  "flags": [
    {
      "rule": "B2",
      "code": "RPC_DEGRADATION",
      "points": 30,
      "triggered": true,
      "observed": 0.08,
      "threshold": 0.03,
      "source": "net_health_snapshots",
      "message": "RPC error rate exceeds threshold"
    },
    {
      "rule": "A1",
      "code": "SOL_BUFFER_LOW",
      "points": 15,
      "triggered": false,
      "skipped": true,
      "reason": "simulate_failed"
    }
  ],
  "evidence": [
    {
      "metric": "rpc_error_rate_1m",
      "value": 0.08,
      "threshold": 0.03,
      "window": "1m",
      "source": "net_health_snapshots"
    },
    {
      "metric": "rpc_error_rate_trend_ratio",
      "value": 4.2,
      "threshold": 3.0,
      "window": "10m",
      "source": "net_health_snapshots"
    }
  ]
}
```

Notes on response:
- "partial" is true when simulate failed. false otherwise.
- flags contain ALL 5 rules (A1, A3, B1, B2, C1) always. triggered + skipped + passed all included.
- skipped rules have skipped=true and reason.
- evidence contains raw metric data that triggered flags.
- risk_score = min(100, sum of points for triggered non-skipped flags)

## Environment Variables (.env + .env.example required)

```
PORT=3000

# x402
X402_FACILITATOR_URL=https://x402.org/facilitator
X402_NETWORK_ID=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
X402_PAYTO_SOLANA=<receiver wallet address>
PRICE_PREFLIGHT_USDC=0.10
PRICE_STATUS_USDC=0.01

# CDP (mainnet only, not needed for devnet testing)
# CDP_API_KEY=
# CDP_API_SECRET=

# Solana RPC (fallback order: Primary -> Secondary -> Tertiary)
# Used by BOTH worker (health pings) and API (simulateTransaction).
# Worker: if all fail, skip snapshot cycle. API: if all fail, simulate_failed or 503.
RPC_PRIMARY_URL=https://api.devnet.solana.com
RPC_SECONDARY_URL=
RPC_TERTIARY_URL=

# Database
SQLITE_PATH=./data/app.db

# Rules
MIN_SOL_BUFFER=0.01
FEE_SPIKE_MULTIPLIER=3.0
RPC_ERROR_RATE_MAX=0.03
RPC_P95_MS_MAX=1200
TREND_RATIO_THRESHOLD=3.0
PROGRAM_BLACKLIST_JSON=[]

# Rate limiting
RATE_LIMIT_RPM=60

# Worker
WORKER_INTERVAL_MS=60000
SNAPSHOT_STALE_MULTIPLIER=3
```

## Architecture

### Worker (background, runs independently)

Every WORKER_INTERVAL_MS (default 60s), writes one row to net_health_snapshots:

Measurement method:
1. Send N RPC pings (getLatestBlockhash) to primary RPC. N=5 recommended.
   RPC fallback order: Primary -> Secondary -> Tertiary. If primary fails all N pings, retry with secondary. If secondary also fails, try tertiary. If all fail, log error and skip this snapshot cycle.
2. Calculate rpc_ok_rate_1m (successes / N) and rpc_p95_ms_1m from latency samples.
3. Calculate rpc_error_rate_1m = 1 - rpc_ok_rate_1m.
4. Try getRecentPrioritizationFees. If empty or unsupported, store null.
5. tx_fail_rate: v1 does NOT measure this (too expensive). Store null.
6. Trend calculation (for C1):
   - Query the snapshot closest to [now-11m, now-9m] window.
   - rpc_error_rate_trend_ratio = current_error_rate / max(prev_error_rate, 0.001)
     (ratio > 1.0 means error rate is growing; e.g., was 0.01, now 0.03 => ratio 3.0)
     epsilon = 0.001 prevents division by zero when prev error rate was 0.
   - If no snapshot in window => store null.

### API (Express + x402 middleware)

Three endpoints:

1. GET /demo/sample (free, no x402)
   Returns a hardcoded example response JSON for schema reference.

2. GET /solana/status (paid, 0.01 USDC)
   Reads latest net_health_snapshots row. Returns neutral metrics only.

3. POST /tx/preflight (paid, 0.10 USDC)
   Full evaluation pipeline. See Rules section below.

### Database (SQLite WAL mode)

Table: net_health_snapshots
- ts TEXT (ISO8601, indexed)
- rpc_ok_rate_1m REAL
- rpc_error_rate_1m REAL
- rpc_p95_ms_1m REAL
- priority_fee_level REAL NULL
- tx_fail_rate_1m REAL NULL
- rpc_error_rate_trend_ratio REAL NULL
- notes TEXT NULL

Table: preflight_logs
- run_id TEXT PRIMARY KEY
- computed_at TEXT
- payer TEXT
- payment_tx TEXT
- rule_set_version TEXT
- request_json TEXT
- response_json TEXT
- risk_score INTEGER

Include migration/init script that creates tables on startup if not exist.

## POST /tx/preflight — Full Pipeline

After x402 payment verification succeeds:

Step 1: Decode transaction
- Try VersionedTransaction.deserialize(Buffer.from(tx_base64, 'base64')) first
- If fails, try Transaction.from(Buffer.from(tx_base64, 'base64'))
- If both fail, return 400 { error: { code: "invalid_tx", message: "..." } }
- Extract fee payer public key

Step 2: simulateTransaction
- RPC fallback order: Primary -> Secondary -> Tertiary. If primary times out or errors, retry with next available RPC. If all fail, set simulate_failed = true.
- For VersionedTransaction: connection.simulateTransaction(vtx, {
    accounts: { addresses: [feePayer.toBase58()], encoding: "base64" }
  })
- For Legacy Transaction: connection.simulateTransaction(tx, {
    accounts: { addresses: [feePayer.toBase58()], encoding: "base64" }
  })
- Set a timeout (5 seconds recommended).
- If simulate fails or times out:
  - Set simulate_failed = true
  - Continue to rule evaluation (A1 will be skipped)

Step 3: Get background data
- Query latest net_health_snapshots row
- If no snapshot exists (worker hasn't run yet), B1/B2/C1 all skip
- STALENESS CHECK: if (now - snapshot.ts) > WORKER_INTERVAL_MS * SNAPSHOT_STALE_MULTIPLIER (default 3min):
  - B1/B2/C1 all skip (reason: "snapshot_stale")
  - Add to evidence array (standard metric form):
    ```json
    {
      "metric": "snapshot_age_sec",
      "value": 195,
      "threshold": 180,
      "window": "now",
      "source": "net_health_snapshots"
    }
    ```
    (value = actual elapsed seconds, threshold = WORKER_INTERVAL_MS * SNAPSHOT_STALE_MULTIPLIER / 1000)
  - A1 and A3 are NOT affected (they don't depend on snapshots)

Step 4: Evaluate rules (all 5, in order)

Rule A1 — SOL Buffer (15 points)
- Requires: simulate success + accounts response
- From simulate result, find fee payer's post-simulation lamports
- Convert to SOL: lamports / 1_000_000_000
- If post_sol < MIN_SOL_BUFFER => triggered
- If simulate failed OR accounts not in response => skipped (reason: "simulate_failed" or "no_account_data")

Rule A3 — Program Blacklist (10 points)
- Extract program IDs from transaction:
  - Legacy: instructions.map(ix => ix.programId.toBase58())
  - Versioned: compiledInstructions.map(ix => staticAccountKeys[ix.programIdIndex].toBase58())
  - Program IDs only reachable via Address Lookup Tables => skip those IDs (do not resolve ALT in v1)
- If any program ID is in PROGRAM_BLACKLIST_JSON => triggered
- If blacklist is empty => not triggered (passes)

Rule B1 — Priority Fee Spike (20 points)
- From latest snapshot: priority_fee_level
- If null => skipped (reason: "priority_fee_data_unavailable")
- Baseline: median of priority_fee_level from last 10 snapshots
- If current >= baseline * FEE_SPIKE_MULTIPLIER => triggered

Rule B2 — RPC Degradation (30 points)
- From latest snapshot: rpc_error_rate_1m, rpc_p95_ms_1m
- If rpc_error_rate_1m > RPC_ERROR_RATE_MAX => triggered
  (e.g., RPC_ERROR_RATE_MAX=0.03 means error rate above 3% triggers)
- OR if rpc_p95_ms_1m > RPC_P95_MS_MAX => triggered

Rule C1 — Trend / Degradation Rate (25 points)
- DATA SOURCE: rpc_error_rate_trend_ratio from latest snapshot
- If null => skipped (reason: "no_trend_data")
- If rpc_error_rate_trend_ratio >= TREND_RATIO_THRESHOLD => triggered
  (ratio = current_error_rate / prev_error_rate; ratio >= 3.0 means error rate tripled in 10 min)
- WHY error_rate not ok_rate: ok_rate moves in tiny increments (0.99->0.97 = ratio 1.02, never triggers).
  error_rate amplifies the signal (0.01->0.03 = ratio 3.0, clearly triggers).
  This is what separates C1(direction) from B2(current level).

Step 5: Calculate risk_score
- risk_score = min(100, sum of points for all triggered + non-skipped flags)

Step 6: Build response and log
- Construct response per schema above
- Write to preflight_logs

## Rate Limiting

Use express-rate-limit package.
- All requests (before x402 middleware): IP-based, RATE_LIMIT_RPM per minute
- Return 429: { error: { code: "rate_limited", message: "...", retry_after: <seconds> } }

## Error Responses (standard structure)

All errors follow:
```json
{ "error": { "code": "string", "message": "string", "trace_id": "uuid" } }
```

Codes:
- 400: "invalid_request" or "invalid_tx"
- 402: x402 payment required (handled by middleware)
- 429: "rate_limited"
- 503: "rpc_unavailable" — returned by /solana/status ONLY when no snapshot exists AND all RPC endpoints are unreachable. /tx/preflight NEVER returns 503.
- 500: "internal_error"

## Tests (required, must pass before delivery)

### Unit tests (one file per rule):
- A1: trigger case (low balance) + non-trigger case (sufficient balance) + skip case (no simulate data)
- A3: trigger case (blacklisted program) + non-trigger case (clean programs) + skip case (empty blacklist)
- B1: trigger case (fee spike) + non-trigger case (normal fee) + skip case (null priority fee)
- B2: trigger case (high error rate) + non-trigger case (healthy)
- C1: trigger case (high trend ratio) + non-trigger case (stable) + skip case (null trend data)

### Risk score test:
- B2 only triggered => 30
- B2 + C1 triggered => 55
- All triggered => 100
- A1 skipped + B2 triggered => 30 (not 45)

### Integration tests:
- Unpaid request to /tx/preflight => 402
- Paid request (mock payment) => 200 with valid response schema
- Simulate failure (mock RPC timeout) => 200 with partial=true and simulate_failed in flags
- Invalid base64 => 400
- Oversized body (>64kb) => 400
- Stale snapshot (mock old timestamp) => B1/B2/C1 all skipped with reason "snapshot_stale"
- /solana/status paid => 200 with snapshot data
- /demo/sample => 200 with example response

### Rate limit test:
- Exceed RPM => 429

## Starter Kit (examples/ directory)

File: examples/safe-send-transaction.ts
- Working x402 client setup (@x402/fetch + @x402/svm)
- .env.example for client (SOLANA_PRIVATE_KEY, PREFLIGHT_API_URL, RISK_THRESHOLD)
- README explaining the pattern

## Project Structure

```
agentops-preflight/
  CLAUDE.md
  src/
    server.ts
    config.ts
    db/
      schema.sql
      init.ts
      queries.ts
    routes/
      preflight.ts
      status.ts
      demo.ts
    rules/
      index.ts
      a1-sol-buffer.ts
      a3-program-blacklist.ts
      b1-fee-spike.ts
      b2-rpc-degradation.ts
      c1-trend.ts
    worker/
      worker.ts
      metrics.ts
    utils/
      tx-parser.ts
      simulate.ts
      errors.ts
  examples/
    safe-send-transaction.ts
    .env.example
    README.md
  tests/
    rules/
    integration/
    fixtures/
  .env.example
  README.md
  package.json
  tsconfig.json
```

## Critical Reminders

- NEVER put disclaimer in JSON response
- NEVER add recommendation/severity/proceed/review fields
- NEVER run simulateTransaction on unpaid requests
- NEVER use whitelist mode for A3 (blacklist only)
- NEVER resolve Address Lookup Tables in v1
- NEVER use stale snapshots without marking B1/B2/C1 as skipped
- NEVER return 503 from /tx/preflight
- flags array MUST always contain exactly 5 rules (A1, A3, B1, B2, C1)
- If priority fee data is unavailable, skip B1 gracefully
- If trend data is unavailable, skip C1 gracefully
- If simulate fails, skip A1 gracefully but evaluate everything else
- If snapshot is stale, skip B1/B2/C1 gracefully (A1/A3 still evaluate)
- All skipped rules must appear in flags with skipped=true and reason
- Reject request bodies larger than 64kb

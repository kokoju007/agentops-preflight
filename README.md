# AgentOps Preflight

Solana transaction risk signals via x402 paid API.

Bot/agent calls preflight before sending a transaction → gets risk_score + evidence → decides to send or hold.

**No API keys. No dashboard. USDC wallet is all you need.**

## What it does

Your bot creates a Solana transaction. Before sending it on-chain, it calls `/tx/preflight` with the base64-encoded transaction. The API evaluates 5 risk rules and returns a score from 0 to 100 with evidence. If the score is high, your bot holds. If low, it sends.

Payment happens automatically via x402 — the first request gets a 402 response with payment instructions, your client pays USDC on-chain, and the API returns the result. One HTTP call, one payment, one response.

## Endpoints

| Endpoint | Price | Description |
|---|---|---|
| `GET /health` | Free | Server health check |
| `GET /demo/sample` | Free | Example response (see the schema before paying) |
| `GET /solana/status` | 0.01 USDC | Network snapshot (RPC health, error rates) |
| `POST /tx/preflight` | 0.10 USDC | Transaction risk assessment (5 rules + evidence) |

**Server:** `http://3.25.180.197:3000`

## Quick Start (5 minutes)

### 1. Check the server

```bash
curl http://3.25.180.197:3000/health
# {"status":"ok","timestamp":"..."}
```

### 2. See the response schema (free)

```bash
curl http://3.25.180.197:3000/demo/sample
```

This returns an example preflight response so you can see the exact format before paying.

### 3. Install dependencies

```bash
npm install @x402/fetch @x402/svm/exact/client @solana/web3.js bs58
```

### 4. Run the example client

Copy `examples/safe-send-transaction.ts` and set your wallet private key:

```bash
export WALLET_PRIVATE_KEY="your_base58_private_key"
npx ts-node examples/safe-send-transaction.ts
```

This calls `/solana/status` (0.01 USDC) to check network health, then `/tx/preflight` (0.10 USDC) with a sample transaction.

### 5. Integrate into your bot

The core pattern is one function:

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmSchemeClient } from "@x402/svm/exact/client";
import { Keypair, Connection } from "@solana/web3.js";
import bs58 from "bs58";

const API_BASE = "http://3.25.180.197:3000";

const keypair = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY!));
const connection = new Connection("https://api.mainnet-beta.solana.com");
const scheme = new ExactSvmSchemeClient(keypair, connection);
const fetchWithPayment = wrapFetchWithPayment(fetch, scheme);

async function safeSendTransaction(txBase64: string): Promise<boolean> {
  const res = await fetchWithPayment(`${API_BASE}/tx/preflight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tx_base64: txBase64 }),
  });

  const data = await res.json();

  if (data.risk_score >= 70) {
    console.log(`HOLD: risk_score=${data.risk_score}`, data.flags);
    return false;
  }

  console.log(`SEND: risk_score=${data.risk_score}`);
  return true;
}
```

## Risk Rules

The API evaluates 5 rules on every preflight call:

| Rule | Code | Description |
|---|---|---|
| A1 | `SOL_BUFFER_LOW` | Does the sender have enough SOL after this tx? |
| A3 | `BLACKLISTED_PROGRAM` | Does the tx interact with known-bad programs? |
| B1 | `PRIORITY_FEE_SPIKE` | Are priority fees abnormally high right now? |
| B2 | `RPC_DEGRADATION` | Is the RPC error rate above threshold? |
| C1 | `ERROR_RATE_TREND` | Is the error rate trending upward? |

Each rule returns one of three statuses:

- **TRIGGERED** — risk detected, points added to risk_score
- **OK** — checked and safe
- **SKIPPED** — not enough data to evaluate

## Response Format

```json
{
  "request_id": "801f04d2-8f4e-4fd4-88e7-fddd4db82e6b",
  "computed_at": "2026-02-07T15:58:22.121Z",
  "rule_set_version": "rev-final-1.0.0",
  "risk_score": 30,
  "partial": false,
  "flags": [
    {
      "rule": "A1",
      "code": "SOL_BUFFER_LOW",
      "status": "TRIGGERED",
      "points": 15,
      "detail": "post_balance=0.002, threshold=0.01"
    },
    {
      "rule": "B2",
      "code": "RPC_DEGRADATION",
      "status": "OK",
      "points": 0,
      "detail": "observed=0.001, threshold=0.03"
    }
  ],
  "evidence": {
    "rpc_ok_rate_1m": 0.99,
    "rpc_error_rate_1m": 0.01,
    "rpc_p95_ms_1m": 207,
    "snapshot_age_sec": 12,
    "trend_ratio": 0.5
  }
}
```

When `partial` is true, it means the transaction simulation failed but the API still evaluated all available rules.

## How x402 Payment Works

x402 is an open protocol that uses HTTP 402 ("Payment Required") for machine-to-machine payments.

1. Your client calls a paid endpoint
2. Server responds with `402 Payment Required` + payment instructions
3. Your client signs a USDC transfer on Solana
4. Client retries the request with the payment proof in a header
5. Server verifies the payment on-chain and returns the result

The `@x402/fetch` wrapper handles steps 2-4 automatically. From your code's perspective, it's just a normal HTTP call that costs USDC.

## Bot Integration Patterns

### Simple guard (recommended)

```typescript
const shouldSend = await safeSendTransaction(myTxBase64);
if (shouldSend) {
  await connection.sendRawTransaction(myTxBuffer);
}
```

### Threshold-based strategy

```typescript
const data = await callPreflight(txBase64);

if (data.risk_score >= 70) {
  log("Skipping tx: high risk");
} else if (data.risk_score >= 40) {
  await sleep(30_000);
} else {
  await sendTransaction(tx);
}
```

### Network health check (cheaper)

```typescript
const status = await callStatus();
if (status.rpc_ok_rate_1m < 0.95) {
  log("Network degraded, pausing all sends");
  return;
}
const preflight = await callPreflight(txBase64);
```

## Pricing

| Endpoint | Price | Use case |
|---|---|---|
| `/solana/status` | 0.01 USDC | Network health monitoring |
| `/tx/preflight` | 0.10 USDC | Per-transaction risk check |

Your bot's wallet needs mainnet USDC (SPL token) and a small amount of SOL for transaction fees.

- **USDC contract:** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **Network:** Solana mainnet (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)

## Important Notes

- This API provides **informational risk signals only**. It does not make trading recommendations.
- Each x402 request is a separate payment. Retrying charges again. Cache results client-side if needed.
- If simulation fails, the API returns `partial: true` with whatever rules it could evaluate.

## Requirements

- Node.js 18+
- A Solana wallet with mainnet USDC
- TypeScript (recommended) or JavaScript

## License

MIT

# AgentOps Preflight v1

Solana transaction risk assessment API with x402 paywall.

## Overview

AgentOps Preflight evaluates Solana transactions before they're sent to the network, assessing risk factors like:

- **A1 - SOL Buffer**: Post-transaction balance check
- **A3 - Program Blacklist**: Detection of known-bad programs
- **B1 - Priority Fee Spike**: Fee market anomaly detection
- **B2 - RPC Degradation**: Network health monitoring
- **C1 - Error Rate Trend**: Degradation trajectory analysis

## Endpoints

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| `/demo/sample` | GET | Free | Example response for schema reference |
| `/solana/status` | GET | 0.01 USDC | Current network health metrics |
| `/tx/preflight` | POST | 0.10 USDC | Full transaction risk assessment |

## Quick Start

### Prerequisites

- Node.js 18+
- Solana wallet with USDC (for paid endpoints)

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required settings:
- `X402_PAYTO_SOLANA`: Your wallet address to receive payments
- `RPC_PRIMARY_URL`: Solana RPC endpoint

### Running

```bash
# Start the server (includes background worker)
npm run dev

# Or run worker separately
npm run worker
```

### Testing

```bash
npm test
```

## API Usage

### Request Format

```json
POST /tx/preflight
Content-Type: application/json

{
  "tx_base64": "<base64-encoded-transaction>"
}
```

### Response Format

```json
{
  "request_id": "uuid",
  "computed_at": "ISO8601",
  "rule_set_version": "rev-final-1.0.0",
  "risk_score": 30,
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
    }
  ],
  "evidence": [...]
}
```

### Risk Score Interpretation

| Score | Risk Level |
|-------|------------|
| 0-25  | Low |
| 26-50 | Moderate |
| 51-75 | High |
| 76-100 | Critical |

## Client Integration

See the `examples/` directory for a complete client implementation using `@x402/fetch`.

```typescript
import { wrapFetch } from '@x402/fetch';
import { createSvmPaymentSigner } from '@x402/svm';

const paymentSigner = createSvmPaymentSigner({ keypair, connection, network });
const x402Fetch = wrapFetch(fetch, paymentSigner);

const response = await x402Fetch('http://localhost:3000/tx/preflight', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tx_base64 }),
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    API Server                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  /demo   │  │ /status  │  │    /tx/preflight     │  │
│  │  (free)  │  │  (0.01)  │  │       (0.10)         │  │
│  └──────────┘  └────┬─────┘  └──────────┬───────────┘  │
│                     │                    │              │
│                     │    x402 Paywall    │              │
│                     └────────┬───────────┘              │
│                              │                          │
│  ┌───────────────────────────▼──────────────────────┐  │
│  │              Rule Engine (5 rules)                │  │
│  │  A1: SOL Buffer    A3: Blacklist   B1: Fee Spike │  │
│  │  B2: RPC Degrade   C1: Trend                     │  │
│  └───────────────────────────┬──────────────────────┘  │
│                              │                          │
│  ┌───────────────────────────▼──────────────────────┐  │
│  │                    SQLite DB                      │  │
│  │  net_health_snapshots  │  preflight_logs         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  Background Worker                       │
│  - Runs every 60s                                       │
│  - Pings RPC endpoints                                  │
│  - Calculates health metrics                            │
│  - Writes snapshots to DB                               │
└─────────────────────────────────────────────────────────┘
```

## x402 Fallback Options

If `@x402/express` packages are unavailable, consider:

1. **x402-solana npm package**: Alternative x402 implementation
2. **Native implementation**: Direct Solana payment verification
3. **Contact x402 maintainers**: For support issues

## Environment Variables

See `.env.example` for all configuration options.

## Project Structure

```
agentops-preflight/
├── src/
│   ├── server.ts          # Express app + x402 setup
│   ├── config.ts          # Environment validation (zod)
│   ├── db/                # SQLite schema + queries
│   ├── routes/            # API endpoints
│   ├── rules/             # Risk evaluation rules
│   ├── worker/            # Background health monitor
│   └── utils/             # Helpers (tx-parser, simulate, errors)
├── examples/              # Client integration examples
├── tests/                 # Unit + integration tests
└── CLAUDE.md             # Full specification
```

## Disclaimer

**THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.**

AgentOps Preflight provides risk assessment based on observable network conditions and transaction analysis. It does not guarantee transaction success or prevent all failures.

- Preflight checks are advisory, not deterministic
- Network conditions can change between check and execution
- The service operators assume no liability for transaction outcomes
- Always conduct independent due diligence
- This is not financial advice

Use at your own risk.

## License

MIT

# AgentOps Preflight - Client Examples

This directory contains example code showing how to integrate the AgentOps Preflight API into your Solana applications.

## safe-send-transaction.ts

A complete example demonstrating the "preflight check before send" pattern:

1. Create a Solana transaction
2. Serialize and send to Preflight API
3. Evaluate the risk score
4. Decide whether to proceed or abort
5. Send transaction if risk is acceptable

### Setup

```bash
# Install dependencies
npm install @solana/web3.js @x402/fetch @x402/svm dotenv bs58

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings
```

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_PRIVATE_KEY` | Base58-encoded wallet private key | Required |
| `PREFLIGHT_API_URL` | AgentOps Preflight API URL | `http://localhost:3000` |
| `RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `RISK_THRESHOLD` | Abort if risk_score >= this value | `50` |

### Run

```bash
npx ts-node safe-send-transaction.ts
```

### How It Works

The example uses `@x402/fetch` to automatically handle payment for the API call. When you call the `/tx/preflight` endpoint:

1. x402 middleware checks if payment is required
2. If payment needed, the payment signer creates and signs a USDC transfer
3. The payment is verified by the API
4. Your preflight request is processed
5. Risk assessment is returned

### Understanding the Response

```json
{
  "request_id": "uuid",
  "risk_score": 30,
  "partial": false,
  "flags": [
    {
      "rule": "B2",
      "code": "RPC_DEGRADATION",
      "triggered": true,
      "points": 30,
      "message": "RPC error rate exceeds threshold"
    },
    {
      "rule": "A1",
      "code": "SOL_BUFFER_LOW",
      "triggered": false,
      "skipped": false
    }
  ]
}
```

- **risk_score**: Sum of points from triggered rules (capped at 100)
- **partial**: True if simulation failed (some rules skipped)
- **flags**: All 5 rules with their evaluation status

### Risk Score Guidelines

| Score | Interpretation |
|-------|---------------|
| 0-25  | Low risk - generally safe to proceed |
| 26-50 | Moderate risk - review flags before proceeding |
| 51-75 | High risk - consider waiting or investigating |
| 76-100 | Critical risk - strongly recommend not proceeding |

## Disclaimer

**THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.**

- Preflight checks provide risk assessment, not guarantees
- Always conduct your own due diligence before sending transactions
- Past performance of network metrics does not guarantee future behavior
- The API operators are not responsible for any losses from transactions
- This is not financial advice

Use at your own risk. Test thoroughly on devnet before mainnet use.

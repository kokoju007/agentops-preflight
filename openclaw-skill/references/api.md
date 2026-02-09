# AgentOps Preflight API Reference

## Base URL

Default: https://preflight.agentops.dev
Override via PREFLIGHT_API_URL environment variable.

## Authentication

All endpoints use x402 micropayment (USDC on Solana).
No API keys. No accounts. Payment IS authentication.

## Endpoints

### POST /tx/preflight

Assess risk of a Solana transaction before sending.

Price: 0.10 USDC per call

Request body:
{
  "tx_base64": "<base64-encoded serialized Solana transaction>"
}

Success response (200):
{
  "request_id": "801f04d2-8f4e-4fd4-88e7-fddd4db82e6b",
  "computed_at": "2026-02-09T12:00:00.000Z",
  "rule_set_version": "rev-final-1.0.0",
  "risk_score": 0,
  "partial": false,
  "flags": [
    {
      "rule": "A1",
      "code": "SOL_BUFFER_OK",
      "severity": "info",
      "message": "..."
    }
  ],
  "evidence": [
    {
      "metric": "fee_payer_lamports",
      "value": 500000000,
      "threshold": 10000000,
      "window": "now",
      "source": "simulate"
    }
  ]
}

### GET /solana/status

Check Solana network health.

Price: 0.01 USDC per call

Success response (200):
{
  "ts": "2026-02-09T12:00:00.000Z",
  "rpc_ok_rate_1m": 1,
  "rpc_error_rate_1m": 0,
  "rpc_p95_ms_1m": 220,
  "priority_fee_level": 0
}

## x402 Payment Flow

1. Call endpoint without payment header
2. Receive HTTP 402 with PaymentRequirements JSON
3. Sign USDC transfer using your Solana wallet
4. Retry request with header: X-PAYMENT: <base64-encoded-signed-payment>
5. Server verifies payment on-chain, returns result

## Error Responses

400: {"error": "invalid_request", "message": "Request body must contain tx_base64 string"}
400: {"error": "invalid_tx", "message": "Failed to decode transaction"}
402: PaymentRequirements object (x402)
429: {"error": "rate_limited", "message": "Too many requests. Please try again later.", "retry_after": 60}
500: {"error": "internal_error", "message": "Failed to evaluate transaction"}
503: {"error": "rpc_unavailable", "message": "No network health data available."}

## Rate Limiting

60 requests per minute per IP. Returns 429 with retry_after field.

## Source Code

https://github.com/kokoju007/agentops-preflight

## Security

- This API never receives or requests private keys
- Transaction data is analyzed but not stored permanently
- Payment verification is done on-chain
- All communication uses HTTPS
- Request body limited to 64KB

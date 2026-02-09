---
name: agentops-preflight
description: Solana transaction risk assessment via AgentOps Preflight API. Check transaction risk before sending. Uses x402 micropayment (USDC on Solana). No private keys required by this skill.
metadata:
  openclaw:
    emoji: "🛡️"
    requires:
      bins: ["curl", "jq"]
---

# AgentOps Preflight — Solana Transaction Risk Check

Use this skill when you need to assess the risk of a Solana transaction BEFORE sending it on-chain.
Useful for any bot or agent that submits Solana transactions and wants to avoid losses from
failed transactions, blacklisted programs, or degraded network conditions.

## When to use

- Before sending any Solana transaction (swap, transfer, DeFi interaction)
- When you want to check if the Solana network is healthy enough to transact
- When you need a risk score (pass / warn / fail) for a serialized transaction

## Two endpoints

1. Transaction preflight check (0.10 USDC per call):
   Analyzes a base64-encoded Solana transaction and returns a risk verdict.

2. Network status check (0.01 USDC per call):
   Returns current Solana network health metrics.

## How to call

### Transaction preflight

{baseDir}/scripts/preflight.sh <base64_encoded_transaction>

Example:
{baseDir}/scripts/preflight.sh "AQAAAA...base64tx..."

Returns JSON with: risk_score, flags, evidence, program checks.

### Network status

{baseDir}/scripts/status.sh

Returns JSON with: rpc_ok_rate_1m, rpc_error_rate_1m, rpc_p95_ms_1m, priority_fee_level.

## x402 payment flow

Both endpoints use x402 (HTTP 402 Payment Required) with USDC on Solana.

1. Script calls endpoint without payment
2. Server returns HTTP 402 with PaymentRequirements JSON
3. Script returns this JSON with added _x402:true and _hint fields
4. Your agent uses its x402/wallet skill to sign payment
5. Your agent retries with X_PAYMENT env var set to the signed payment
6. Server verifies payment on-chain and returns the result

This skill does NOT handle payment signing. It does NOT require any private keys.

## Configuration

{
  "skills": {
    "entries": {
      "agentops-preflight": {
        "enabled": true,
        "env": {
          "PREFLIGHT_API_URL": "https://preflight.agentops.dev",
          "PREFLIGHT_API_ALLOWED_HOSTS": "preflight.agentops.dev"
        }
      }
    }
  }
}

### Optional security environment variables

PREFLIGHT_API_ALLOWED_HOSTS: Comma-separated list of allowed hostnames.
  If set, scripts will refuse to connect to any host not in this list.
  Recommended default: "preflight.agentops.dev"

PREFLIGHT_TX_MAX_LEN: Maximum length of base64 transaction input (default: 200000).

PREFLIGHT_TIMEOUT_SEC: HTTP timeout in seconds (default: 15 for preflight, 10 for status).

## Security principles

1. NO PRIVATE KEYS: This skill never asks for or handles wallet private keys.
   Payment signing is your agent's wallet/x402 infrastructure responsibility.

2. HTTPS ENFORCED: Scripts reject any PREFLIGHT_API_URL that does not start with https://.

3. HOST ALLOWLIST: When PREFLIGHT_API_ALLOWED_HOSTS is set, scripts only connect
   to listed hostnames. All other hosts are blocked.

4. INPUT SIZE LIMIT: Transaction data is capped at PREFLIGHT_TX_MAX_LEN characters.

5. NO FILESYSTEM ACCESS: Scripts do not read, write, or scan any files.

6. NO SHELL INJECTION: All inputs are validated. No eval, no command substitution.
   Shell metacharacters are rejected.

7. DEPENDENCY CHECK: Scripts verify curl and jq are available before executing.

8. OPEN SOURCE: https://github.com/kokoju007/agentops-preflight
   Review the code before installing.

## Output format

All responses are JSON.

Preflight success (200):
{
  "request_id": "801f04d2-...",
  "computed_at": "2026-02-09T12:00:00Z",
  "rule_set_version": "rev-final-1.0.0",
  "risk_score": 0,
  "partial": false,
  "flags": [],
  "evidence": []
}

Status success (200):
{
  "ts": "2026-02-09T12:00:00Z",
  "rpc_ok_rate_1m": 1,
  "rpc_error_rate_1m": 0,
  "rpc_p95_ms_1m": 220,
  "priority_fee_level": 0
}

Payment required (402): PaymentRequirements JSON with added _x402:true and _hint fields.
Error: JSON with "error" field.

# AgentOps Preflight — Marketing & Onboarding Kit

## One-liner (X, Discord, Telegram)

Solana 봇 운영 중이면 tx 보내기 전에 0.10 USDC로 risk_score 받고, 높으면 자동 보류하는 preflight API 만들었습니다. x402로 지갑 결제, API 키 없음. 5분이면 붙입니다.

**English:**

Solana bot operators — preflight your tx for 0.10 USDC before sending. Get risk_score + evidence. If risky, auto-hold. x402 wallet payment, no API keys. 5-minute integration.

## Short Pitch (5 lines)

1. Your bot creates a Solana transaction. Before sending, call `/tx/preflight`.
2. You get a `risk_score` (0-100), triggered flags, and evidence metrics.
3. If risk is high, your bot holds or retries later. If low, send immediately.
4. Payment is x402 — your wallet pays USDC per request. No API keys, no signup.
5. This is risk signals only. No trading recommendations. Your bot decides.

## DM Template

> Hey — I run a DLMM/Meteora bot on Solana and got tired of losing gas on failed transactions during degraded RPC windows.
>
> Built a simple API that checks 5 risk conditions before each send: RPC error rate, priority fee spikes, SOL buffer, known-bad programs, error rate trends.
>
> You get a risk_score (0-100) + evidence. High score = hold. Low = send.
>
> Integration is one function call. Payment is x402 (USDC from your wallet, per request). No API key, no dashboard.
>
> Quick test:
> ```
> curl http://3.25.180.197:3000/demo/sample
> ```
>
> Full example:
> `examples/safe-send-transaction.ts` in the repo

## Agent Marketplace Card

- **Name:** AgentOps Preflight
- **Category:** Agent Tool / Transaction Safety / Solana Ops
- **Pricing:** `/solana/status` 0.01 USDC, `/tx/preflight` 0.10 USDC
- **Payment:** x402 protocol (wallet-based, no API keys)
- **Network:** Solana mainnet
- **Input:** `{ "tx_base64": "..." }`
- **Output:** `{ request_id, risk_score, partial, flags[], evidence{} }`
- **Safety:** Informational signals only. Not investment advice.

## FAQ

**Q: How is this different from simulateTransaction?**
A: `simulateTransaction` tells you if a tx will succeed right now. Preflight tells you if conditions are risky. They complement each other.

**Q: What if the API is down?**
A: Your bot should fall back to sending normally. Treat API failures as "proceed with caution."

**Q: Is this custodial?**
A: No. x402 payments go directly from your wallet to the server wallet on-chain.

**Q: Can I test without paying?**
A: Yes. `GET /demo/sample` returns a full example response for free.

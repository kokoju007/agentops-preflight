# Examples

## safe-send-transaction.ts

Complete working example: health check → network status (0.01 USDC) → preflight (0.10 USDC) → send/hold decision.

### Setup

```bash
npm install @x402/fetch @x402/svm/exact/client @solana/web3.js bs58
cp .env.example .env
# Edit .env and set your WALLET_PRIVATE_KEY
```

### Run

```bash
npx ts-node safe-send-transaction.ts
```

### Integrating into your bot

```typescript
// Before
await connection.sendRawTransaction(txBuffer);

// After (with preflight guard)
const shouldSend = await safeSendTransaction(txBase64);
if (shouldSend) {
  await connection.sendRawTransaction(txBuffer);
}
```

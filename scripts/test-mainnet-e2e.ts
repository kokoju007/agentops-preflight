/**
 * Mainnet x402 E2E Payment Test
 *
 * Tests the full x402 payment flow against mainnet server:
 * 1. GET /solana/status (0.01 USDC) — 402 then paid 200
 * 2. POST /tx/preflight (0.10 USDC) — 402 then paid 200
 *
 * Usage: npx ts-node scripts/test-mainnet-e2e.ts
 */

import { Keypair, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { toClientSvmSigner, SOLANA_MAINNET_CAIP2 } from '@x402/svm';
import bs58 from 'bs58';

const { registerExactSvmScheme } = require('@x402/svm/exact/client') as {
  registerExactSvmScheme: (client: any, config: any) => any;
};

const API_URL = process.env.PREFLIGHT_API_URL || 'http://localhost:13000';
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const SERVER_WALLET = 'EKyqvhQT8uM9jyFjCXUbGmfY3n4mKfPcZMNnn6ktug5Y';
const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Client wallet private key (base58)
const CLIENT_PRIVKEY_B58 = '24VqdZmijHqiqDYMLMAoLoahkP7vazrvGZLjJfG4cbQDdegBRZizenF2C2k9guncD3Px3qqLvpyJcenCfyi2WDfL';

async function checkUsdcBalance(connection: Connection, wallet: PublicKey, label: string): Promise<number> {
  const { getAssociatedTokenAddress } = await import('@solana/spl-token');
  const ata = await getAssociatedTokenAddress(new PublicKey(MAINNET_USDC_MINT), wallet);
  try {
    const balance = await connection.getTokenAccountBalance(ata);
    const amount = parseFloat(balance.value.uiAmountString || '0');
    console.log(`  ${label} USDC balance: ${amount} (ATA: ${ata.toBase58()})`);
    return amount;
  } catch {
    console.log(`  ${label} USDC balance: 0 (no ATA)`);
    return 0;
  }
}

async function main() {
  console.log('=== AgentOps Preflight — Mainnet E2E Payment Test ===\n');

  // Decode base58 private key to keypair
  const secretKey = bs58.decode(CLIENT_PRIVKEY_B58);
  const keypair = Keypair.fromSecretKey(secretKey);
  console.log(`Client wallet: ${keypair.publicKey.toBase58()}`);
  console.log(`Server wallet: ${SERVER_WALLET}`);
  console.log(`API URL: ${API_URL}`);
  console.log(`Network: Solana mainnet`);

  // Check initial balances
  const connection = new Connection(RPC_URL, 'confirmed');
  console.log('\n--- Initial Balances ---');
  const clientSolBalance = await connection.getBalance(keypair.publicKey);
  console.log(`  Client SOL: ${clientSolBalance / LAMPORTS_PER_SOL}`);
  const clientUsdcBefore = await checkUsdcBalance(connection, keypair.publicKey, 'Client');
  const serverUsdcBefore = await checkUsdcBalance(connection, new PublicKey(SERVER_WALLET), 'Server');

  if (clientUsdcBefore < 0.11) {
    console.error(`\nERROR: Client wallet needs at least 0.11 USDC for tests (has ${clientUsdcBefore})`);
    console.error('Fund the wallet with mainnet USDC first.');
    process.exit(1);
  }

  // Create @solana/kit signer and x402 client
  const kitSigner = await createKeyPairSignerFromBytes(secretKey);
  const svmSigner = toClientSvmSigner(kitSigner);

  const client = new x402Client();
  registerExactSvmScheme(client, {
    signer: svmSigner,
    networks: [SOLANA_MAINNET_CAIP2],
  });

  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  // ==============================
  // TEST 1: GET /solana/status (0.01 USDC)
  // ==============================
  console.log('\n\n========================================');
  console.log('TEST 1: GET /solana/status (0.01 USDC)');
  console.log('========================================');

  // Step 1a: Verify 402 without payment
  console.log('\n[1a] Calling without payment...');
  const unpaidStatusRes = await fetch(`${API_URL}/solana/status`);
  console.log(`  Response: ${unpaidStatusRes.status} ${unpaidStatusRes.statusText}`);

  if (unpaidStatusRes.status !== 402) {
    console.error(`  FAIL: Expected 402, got ${unpaidStatusRes.status}`);
    process.exit(1);
  }

  // Parse PAYMENT-REQUIRED header
  const payReqHeader = unpaidStatusRes.headers.get('PAYMENT-REQUIRED');
  if (payReqHeader) {
    const payReq = JSON.parse(Buffer.from(payReqHeader, 'base64').toString());
    console.log(`  x402 version: ${payReq.x402Version}`);
    console.log(`  Network: ${payReq.accepts?.[0]?.network}`);
    console.log(`  Asset: ${payReq.accepts?.[0]?.asset}`);
    console.log(`  Amount: ${payReq.accepts?.[0]?.amount} (raw)`);
    console.log(`  PayTo: ${payReq.accepts?.[0]?.payTo}`);
  }
  console.log('  PASS: 402 confirmed');

  // Step 1b: Pay and get response
  console.log('\n[1b] Calling with x402 payment...');
  try {
    const paidStatusRes = await fetchWithPay(`${API_URL}/solana/status`);
    console.log(`  Response: ${paidStatusRes.status} ${paidStatusRes.statusText}`);

    if (paidStatusRes.ok) {
      const data = await paidStatusRes.json();
      console.log('  PASS: 200 OK');
      console.log('  Response data:', JSON.stringify(data, null, 2));

      // Extract payment tx from response header
      const paymentResponse = paidStatusRes.headers.get('PAYMENT-RESPONSE');
      if (paymentResponse) {
        try {
          const decoded = JSON.parse(Buffer.from(paymentResponse, 'base64').toString());
          console.log('\n  Payment response:');
          console.log(`    Success: ${decoded.success}`);
          console.log(`    Transaction: ${decoded.transaction || decoded.txHash || 'N/A'}`);
          if (decoded.transaction || decoded.txHash) {
            const txHash = decoded.transaction || decoded.txHash;
            console.log(`    Explorer: https://solscan.io/tx/${txHash}`);
          }
        } catch {
          console.log('  Payment response (raw):', paymentResponse.substring(0, 200));
        }
      }
    } else {
      const errBody = await paidStatusRes.text();
      console.error(`  FAIL: ${paidStatusRes.status} — ${errBody}`);
      // Show relevant headers
      for (const [key, val] of paidStatusRes.headers.entries()) {
        if (key.toLowerCase().includes('payment') || key.toLowerCase().includes('x-')) {
          console.error(`  Header ${key}: ${val.substring(0, 300)}`);
        }
      }
    }
  } catch (err: any) {
    console.error(`  ERROR: ${err.message}`);
    if (err.cause) console.error(`  Cause:`, err.cause);
  }

  // ==============================
  // TEST 2: POST /tx/preflight (0.10 USDC)
  // ==============================
  console.log('\n\n========================================');
  console.log('TEST 2: POST /tx/preflight (0.10 USDC)');
  console.log('========================================');

  // Build a sample mainnet transaction (self-transfer 0.001 SOL)
  console.log('\n[2a] Building sample transaction...');
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: keypair.publicKey,
      lamports: 0.001 * LAMPORTS_PER_SOL,
    })
  );
  tx.feePayer = keypair.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const serialized = tx.serialize({ requireAllSignatures: false });
  const tx_base64 = serialized.toString('base64');
  console.log(`  Transaction size: ${serialized.length} bytes`);
  console.log(`  Fee payer: ${keypair.publicKey.toBase58()}`);

  // Step 2a: Verify 402 without payment
  console.log('\n[2b] Calling without payment...');
  const unpaidPreflightRes = await fetch(`${API_URL}/tx/preflight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tx_base64 }),
  });
  console.log(`  Response: ${unpaidPreflightRes.status} ${unpaidPreflightRes.statusText}`);

  if (unpaidPreflightRes.status !== 402) {
    console.error(`  FAIL: Expected 402, got ${unpaidPreflightRes.status}`);
    process.exit(1);
  }
  console.log('  PASS: 402 confirmed');

  // Step 2b: Pay and get preflight response
  console.log('\n[2c] Calling with x402 payment...');
  try {
    const paidPreflightRes = await fetchWithPay(`${API_URL}/tx/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_base64 }),
    });
    console.log(`  Response: ${paidPreflightRes.status} ${paidPreflightRes.statusText}`);

    if (paidPreflightRes.ok) {
      const data = await paidPreflightRes.json();
      console.log('  PASS: 200 OK');
      console.log(`\n  Request ID: ${data.request_id}`);
      console.log(`  Computed At: ${data.computed_at}`);
      console.log(`  Rule Set: ${data.rule_set_version}`);
      console.log(`  Risk Score: ${data.risk_score}`);
      console.log(`  Partial: ${data.partial}`);
      console.log('\n  Flags (5 rules):');
      for (const flag of data.flags || []) {
        const status = flag.skipped ? 'SKIPPED' : flag.triggered ? 'TRIGGERED' : 'OK';
        const detail = flag.skipped
          ? `reason: ${flag.reason}`
          : flag.triggered
            ? `observed: ${flag.observed}, threshold: ${flag.threshold}`
            : '';
        console.log(`    [${status}] ${flag.rule} (${flag.code}) ${flag.points}pts ${detail}`);
      }

      if (data.evidence?.length) {
        console.log('\n  Evidence:');
        for (const e of data.evidence) {
          console.log(`    ${e.metric}: ${e.value} (threshold: ${e.threshold}, window: ${e.window})`);
        }
      }

      // Extract payment tx
      const paymentResponse = paidPreflightRes.headers.get('PAYMENT-RESPONSE');
      if (paymentResponse) {
        try {
          const decoded = JSON.parse(Buffer.from(paymentResponse, 'base64').toString());
          console.log('\n  Payment response:');
          console.log(`    Success: ${decoded.success}`);
          console.log(`    Transaction: ${decoded.transaction || decoded.txHash || 'N/A'}`);
          if (decoded.transaction || decoded.txHash) {
            const txHash = decoded.transaction || decoded.txHash;
            console.log(`    Explorer: https://solscan.io/tx/${txHash}`);
          }
        } catch {
          console.log('  Payment response (raw):', paymentResponse.substring(0, 200));
        }
      }
    } else {
      const errBody = await paidPreflightRes.text();
      console.error(`  FAIL: ${paidPreflightRes.status} — ${errBody}`);
      for (const [key, val] of paidPreflightRes.headers.entries()) {
        if (key.toLowerCase().includes('payment') || key.toLowerCase().includes('x-')) {
          console.error(`  Header ${key}: ${val.substring(0, 300)}`);
        }
      }
    }
  } catch (err: any) {
    console.error(`  ERROR: ${err.message}`);
    if (err.cause) console.error(`  Cause:`, err.cause);
  }

  // ==============================
  // FINAL: Check balances after payments
  // ==============================
  console.log('\n\n========================================');
  console.log('POST-TEST BALANCE CHECK');
  console.log('========================================');

  // Wait a moment for on-chain finality
  console.log('\nWaiting 5s for on-chain finality...');
  await new Promise(r => setTimeout(r, 5000));

  const clientUsdcAfter = await checkUsdcBalance(connection, keypair.publicKey, 'Client');
  const serverUsdcAfter = await checkUsdcBalance(connection, new PublicKey(SERVER_WALLET), 'Server');

  const clientDelta = clientUsdcAfter - clientUsdcBefore;
  const serverDelta = serverUsdcAfter - serverUsdcBefore;
  console.log(`\n  Client USDC change: ${clientDelta >= 0 ? '+' : ''}${clientDelta.toFixed(6)}`);
  console.log(`  Server USDC change: ${serverDelta >= 0 ? '+' : ''}${serverDelta.toFixed(6)}`);

  if (serverDelta > 0) {
    console.log('  PASS: Server received USDC payments');
  } else {
    console.log('  NOTE: Server USDC balance unchanged (facilitator may settle later)');
  }

  console.log('\n=== E2E Test Complete ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

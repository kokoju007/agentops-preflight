/**
 * x402 Payment Test Script
 *
 * Tests the x402 payment flow against the running server:
 * 1. GET /solana/status (0.01 USDC) - should return 402, then paid response
 * 2. POST /tx/preflight (0.10 USDC) - should return 402, then paid response
 *
 * Prerequisites:
 * - Server running on localhost:3000
 * - Client wallet funded with devnet USDC (mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)
 * - Get devnet USDC from https://faucet.circle.com (select Solana, USDC)
 */

import { Keypair, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { toClientSvmSigner, SOLANA_DEVNET_CAIP2 } from '@x402/svm';

const { registerExactSvmScheme } = require('@x402/svm/exact/client') as {
  registerExactSvmScheme: (client: any, config: any) => any;
};

import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.PREFLIGHT_API_URL || 'http://localhost:3000';
const RPC_URL = process.env.RPC_PRIMARY_URL || 'https://api.devnet.solana.com';

async function main() {
  // Load wallet
  const walletPath = process.env.SERVER_WALLET_KEYPAIR || './devnet-wallet.json';
  const raw = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  console.log(`Client wallet: ${keypair.publicKey.toBase58()}`);

  // Create @solana/kit signer from keypair bytes
  const kitSigner = await createKeyPairSignerFromBytes(keypair.secretKey);
  const svmSigner = toClientSvmSigner(kitSigner);

  // Build x402 client with SVM scheme
  const client = new x402Client();
  registerExactSvmScheme(client, {
    signer: svmSigner,
    networks: [SOLANA_DEVNET_CAIP2],
  });

  // Wrap fetch with x402 payment
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  // --- Test 1: GET /solana/status (0.01 USDC) ---
  console.log('\n=== Test 1: GET /solana/status (0.01 USDC) ===');
  try {
    // First, verify it returns 402 without payment
    const unpaidRes = await fetch(`${API_URL}/solana/status`);
    console.log(`Unpaid response: ${unpaidRes.status} ${unpaidRes.statusText}`);

    if (unpaidRes.status !== 402) {
      console.error('Expected 402 but got', unpaidRes.status);
    } else {
      console.log('402 confirmed. Now attempting paid request...');
    }

    // Now try with payment
    try {
      const paidRes = await fetchWithPay(`${API_URL}/solana/status`);
      console.log(`Paid response: ${paidRes.status} ${paidRes.statusText}`);

      if (paidRes.ok) {
        const data = await paidRes.json();
        console.log('Status data:', JSON.stringify(data, null, 2));

        // Check payment response header
        const paymentResponse = paidRes.headers.get('PAYMENT-RESPONSE');
        if (paymentResponse) {
          const decoded = JSON.parse(Buffer.from(paymentResponse, 'base64').toString());
          console.log('Payment response:', JSON.stringify(decoded, null, 2));
        }
      } else {
        const err = await paidRes.text();
        console.error('Paid request failed:', paidRes.status, err);
        // Check headers for more info
        for (const [key, val] of paidRes.headers.entries()) {
          if (key.toLowerCase().includes('payment') || key.toLowerCase().includes('x-')) {
            console.error(`  Header ${key}: ${val.substring(0, 200)}`);
          }
        }
      }
    } catch (payErr: any) {
      console.error('Payment attempt threw error:', payErr.message || payErr);
      if (payErr.cause) console.error('  Cause:', payErr.cause);
    }
  } catch (err) {
    console.error('Test 1 error:', err);
  }

  // --- Test 2: POST /tx/preflight (0.10 USDC) ---
  console.log('\n=== Test 2: POST /tx/preflight (0.10 USDC) ===');
  try {
    // Build a sample transaction
    const connection = new Connection(RPC_URL, 'confirmed');
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

    console.log(`Transaction size: ${serialized.length} bytes`);

    // Verify 402 without payment
    const unpaidRes = await fetch(`${API_URL}/tx/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_base64 }),
    });
    console.log(`Unpaid response: ${unpaidRes.status} ${unpaidRes.statusText}`);

    if (unpaidRes.status !== 402) {
      console.error('Expected 402 but got', unpaidRes.status);
    } else {
      console.log('402 confirmed. Now attempting paid request...');
    }

    // Now try with payment
    const paidRes = await fetchWithPay(`${API_URL}/tx/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_base64 }),
    });
    console.log(`Paid response: ${paidRes.status} ${paidRes.statusText}`);

    if (paidRes.ok) {
      const data = await paidRes.json();
      console.log('Preflight result:');
      console.log(`  Request ID: ${data.request_id}`);
      console.log(`  Risk Score: ${data.risk_score}`);
      console.log(`  Partial: ${data.partial}`);
      console.log('  Flags:');
      for (const flag of data.flags || []) {
        const status = flag.skipped ? 'SKIPPED' : flag.triggered ? 'TRIGGERED' : 'OK';
        console.log(`    [${status}] ${flag.rule} (${flag.code}) - ${flag.points}pts`);
      }
    } else {
      const err = await paidRes.text();
      console.error('Paid request failed:', err);
    }
  } catch (err) {
    console.error('Test 2 error:', err);
  }

  console.log('\n=== Tests complete ===');
}

main().catch(console.error);

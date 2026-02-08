/**
 * Safe Send Transaction Example
 *
 * This example demonstrates how to use the AgentOps Preflight API
 * to assess transaction risk before sending to the Solana network.
 *
 * DISCLAIMER: This is example code for educational purposes only.
 * Always review and test thoroughly before using in production.
 * The preflight check provides risk assessment, not guarantees.
 */

import {
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { wrapFetch } from '@x402/fetch';
import { createSvmPaymentSigner, Network } from '@x402/svm';
import * as dotenv from 'dotenv';
import * as bs58 from 'bs58';

dotenv.config();

// Configuration from environment
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY!;
const PREFLIGHT_API_URL = process.env.PREFLIGHT_API_URL || 'http://localhost:3000';
const RISK_THRESHOLD = parseInt(process.env.RISK_THRESHOLD || '50', 10);
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';

interface PreflightResponse {
  request_id: string;
  computed_at: string;
  rule_set_version: string;
  risk_score: number;
  partial: boolean;
  flags: Array<{
    rule: string;
    code: string;
    points: number;
    triggered: boolean;
    skipped?: boolean;
    reason?: string;
    message?: string;
  }>;
  evidence: Array<{
    metric: string;
    value: number;
    threshold: number;
    window: string;
    source: string;
  }>;
}

async function main() {
  // Validate environment
  if (!SOLANA_PRIVATE_KEY) {
    console.error('Error: SOLANA_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  // Load keypair
  let keypair: Keypair;
  try {
    const secretKey = bs58.decode(SOLANA_PRIVATE_KEY);
    keypair = Keypair.fromSecretKey(secretKey);
  } catch {
    console.error('Error: Invalid SOLANA_PRIVATE_KEY format. Expected base58-encoded secret key.');
    process.exit(1);
  }

  console.log(`Wallet: ${keypair.publicKey.toBase58()}`);

  // Create connection
  const connection = new Connection(RPC_URL, 'confirmed');

  // Create a sample transaction (sending 0.001 SOL to self)
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: keypair.publicKey, // Sending to self for demo
      lamports: 0.001 * LAMPORTS_PER_SOL,
    })
  );

  transaction.feePayer = keypair.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  // Serialize transaction for preflight
  const serialized = transaction.serialize({ requireAllSignatures: false });
  const tx_base64 = serialized.toString('base64');

  console.log('\n--- Preflight Check ---');

  try {
    // Setup x402 payment signer
    // Determine network from RPC URL
    let network: Network = 'mainnet';
    if (RPC_URL.toLowerCase().includes('devnet')) {
      network = 'devnet';
    } else if (RPC_URL.toLowerCase().includes('testnet')) {
      network = 'testnet';
    }

    const paymentSigner = createSvmPaymentSigner({
      keypair,
      connection: RPC_URL,
      network,
    });

    // Wrap fetch with x402 payment capability
    const x402Fetch = wrapFetch(fetch, paymentSigner);

    // Call preflight API
    const response = await x402Fetch(`${PREFLIGHT_API_URL}/tx/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_base64 }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Preflight API error:', error);
      process.exit(1);
    }

    const preflight: PreflightResponse = await response.json();

    console.log(`Request ID: ${preflight.request_id}`);
    console.log(`Risk Score: ${preflight.risk_score}`);
    console.log(`Partial: ${preflight.partial}`);
    console.log('\nFlags:');

    for (const flag of preflight.flags) {
      const status = flag.skipped ? 'SKIPPED' : flag.triggered ? 'TRIGGERED' : 'OK';
      console.log(`  [${status}] ${flag.rule} (${flag.code}) - ${flag.points} points`);
      if (flag.message) {
        console.log(`           ${flag.message}`);
      }
      if (flag.skipped && flag.reason) {
        console.log(`           Reason: ${flag.reason}`);
      }
    }

    if (preflight.evidence.length > 0) {
      console.log('\nEvidence:');
      for (const ev of preflight.evidence) {
        console.log(`  ${ev.metric}: ${ev.value} (threshold: ${ev.threshold}, window: ${ev.window})`);
      }
    }

    // Decision based on risk score
    console.log('\n--- Decision ---');

    if (preflight.risk_score >= RISK_THRESHOLD) {
      console.log(`ABORT: Risk score ${preflight.risk_score} >= threshold ${RISK_THRESHOLD}`);
      console.log('Transaction not sent. Review the flags above for details.');
      process.exit(0);
    }

    if (preflight.partial) {
      console.log('WARNING: Partial evaluation (simulation failed)');
      console.log('Consider manual review before proceeding.');
    }

    console.log(`PROCEED: Risk score ${preflight.risk_score} < threshold ${RISK_THRESHOLD}`);

    // Send the transaction
    console.log('\n--- Sending Transaction ---');
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
    console.log(`Transaction sent: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();

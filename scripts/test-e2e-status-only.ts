/**
 * E2E Test: GET /solana/status (0.01 USDC) — single payment only
 */
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { toClientSvmSigner, SOLANA_MAINNET_CAIP2 } from '@x402/svm';
import bs58 from 'bs58';

const { registerExactSvmScheme } = require('@x402/svm/exact/client') as {
  registerExactSvmScheme: (client: any, config: any) => any;
};

const API_URL = 'http://localhost:13000'; // SSH tunnel to EC2:3000
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const SERVER_WALLET = 'EKyqvhQT8uM9jyFjCXUbGmfY3n4mKfPcZMNnn6ktug5Y';
const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const CLIENT_PRIVKEY_B58 = '24VqdZmijHqiqDYMLMAoLoahkP7vazrvGZLjJfG4cbQDdegBRZizenF2C2k9guncD3Px3qqLvpyJcenCfyi2WDfL';

async function checkUsdcBalance(connection: Connection, wallet: PublicKey): Promise<number> {
  const { getAssociatedTokenAddress } = await import('@solana/spl-token');
  const ata = await getAssociatedTokenAddress(new PublicKey(MAINNET_USDC_MINT), wallet);
  try {
    const balance = await connection.getTokenAccountBalance(ata);
    return parseFloat(balance.value.uiAmountString || '0');
  } catch {
    return 0;
  }
}

async function main() {
  console.log('=== E2E: GET /solana/status (0.01 USDC) ===\n');

  const secretKey = bs58.decode(CLIENT_PRIVKEY_B58);
  const keypair = Keypair.fromSecretKey(secretKey);
  console.log(`Client: ${keypair.publicKey.toBase58()}`);
  console.log(`Server: ${SERVER_WALLET}`);

  const connection = new Connection(RPC_URL, 'confirmed');

  // Pre-test balances
  const clientUsdcBefore = await checkUsdcBalance(connection, keypair.publicKey);
  const serverUsdcBefore = await checkUsdcBalance(connection, new PublicKey(SERVER_WALLET));
  console.log(`\nPRE-TEST BALANCES:`);
  console.log(`  Client USDC: ${clientUsdcBefore}`);
  console.log(`  Server USDC: ${serverUsdcBefore}`);

  // === (a) 402 응답 전체 ===
  console.log('\n--- (a) 402 Response (unpaid) ---');
  const unpaidRes = await fetch(`${API_URL}/solana/status`);
  console.log(`HTTP ${unpaidRes.status} ${unpaidRes.statusText}`);
  const payReqHeader = unpaidRes.headers.get('PAYMENT-REQUIRED');
  if (payReqHeader) {
    const payReq = JSON.parse(Buffer.from(payReqHeader, 'base64').toString());
    console.log(JSON.stringify(payReq, null, 2));
  }

  if (unpaidRes.status !== 402) {
    console.error('FAIL: expected 402');
    process.exit(1);
  }

  // Setup x402 client
  const kitSigner = await createKeyPairSignerFromBytes(secretKey);
  const svmSigner = toClientSvmSigner(kitSigner);
  const client = new x402Client();
  registerExactSvmScheme(client, {
    signer: svmSigner,
    networks: [SOLANA_MAINNET_CAIP2],
  });
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  // === (b) Paid request ===
  console.log('\n--- (b) Paid Request ---');
  const paidRes = await fetchWithPay(`${API_URL}/solana/status`);
  console.log(`HTTP ${paidRes.status} ${paidRes.statusText}`);

  // Payment response header (contains tx signature)
  const payResHeader = paidRes.headers.get('PAYMENT-RESPONSE');
  if (payResHeader) {
    try {
      const decoded = JSON.parse(Buffer.from(payResHeader, 'base64').toString());
      console.log('\nPAYMENT-RESPONSE:');
      console.log(JSON.stringify(decoded, null, 2));
      if (decoded.transaction) {
        console.log(`\nSolscan: https://solscan.io/tx/${decoded.transaction}`);
      }
    } catch {
      console.log('PAYMENT-RESPONSE (raw):', payResHeader.substring(0, 300));
    }
  }

  if (paidRes.ok) {
    const data = await paidRes.json();
    console.log('\nRESPONSE BODY:');
    console.log(JSON.stringify(data, null, 2));
  } else {
    const errBody = await paidRes.text();
    console.error(`FAIL: ${paidRes.status} — ${errBody}`);
    // Show error headers
    for (const [key, val] of paidRes.headers.entries()) {
      if (key.toLowerCase().includes('payment')) {
        try {
          const decoded = JSON.parse(Buffer.from(val, 'base64').toString());
          console.error(`\n${key} (decoded):`, JSON.stringify(decoded, null, 2));
        } catch {
          console.error(`${key}: ${val.substring(0, 300)}`);
        }
      }
    }
  }

  // === (d) Post-test balance check ===
  console.log('\n--- (d) Balance Check (waiting 8s for finality) ---');
  await new Promise(r => setTimeout(r, 8000));
  const clientUsdcAfter = await checkUsdcBalance(connection, keypair.publicKey);
  const serverUsdcAfter = await checkUsdcBalance(connection, new PublicKey(SERVER_WALLET));
  console.log(`  Client USDC: ${clientUsdcAfter} (delta: ${(clientUsdcAfter - clientUsdcBefore).toFixed(6)})`);
  console.log(`  Server USDC: ${serverUsdcAfter} (delta: ${(serverUsdcAfter - serverUsdcBefore).toFixed(6)})`);

  console.log('\n=== DONE ===');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });

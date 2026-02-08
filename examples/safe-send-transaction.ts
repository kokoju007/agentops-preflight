/**
 * AgentOps Preflight — Example Client
 *
 * Usage:
 *   export WALLET_PRIVATE_KEY="your_base58_private_key"
 *   npx ts-node examples/safe-send-transaction.ts
 *
 * Requirements:
 *   npm install @x402/fetch @x402/svm/exact/client @solana/web3.js bs58
 */

import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmSchemeClient } from "@x402/svm/exact/client";
import { Keypair, Connection, SystemProgram, Transaction, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const API_BASE = process.env.API_BASE || "http://3.25.180.197:3000";
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const RISK_THRESHOLD = 70;

const privateKey = process.env.WALLET_PRIVATE_KEY;
if (!privateKey) {
  console.error("Set WALLET_PRIVATE_KEY env var (base58 encoded)");
  process.exit(1);
}

const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
const connection = new Connection(RPC_URL);
const scheme = new ExactSvmSchemeClient(keypair, connection);
const fetchWithPayment = wrapFetchWithPayment(fetch, scheme);

console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
console.log(`Server: ${API_BASE}`);
console.log(`Threshold: risk_score >= ${RISK_THRESHOLD} → HOLD\n`);

async function checkHealth(): Promise<boolean> {
  console.log("--- Step 1: Health Check (free) ---");
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    console.log(`Status: ${data.status}\n`);
    return data.status === "ok";
  } catch (e: any) {
    console.error(`Health check failed: ${e.message}`);
    return false;
  }
}

async function checkNetworkStatus(): Promise<any> {
  console.log("--- Step 2: Network Status (0.01 USDC) ---");
  const res = await fetchWithPayment(`${API_BASE}/solana/status`);
  const data = await res.json();
  console.log(`RPC OK rate:    ${(data.rpc_ok_rate_1m * 100).toFixed(1)}%`);
  console.log(`RPC error rate: ${(data.rpc_error_rate_1m * 100).toFixed(1)}%`);
  console.log(`RPC p95 ms:     ${data.rpc_p95_ms_1m}\n`);
  return data;
}

async function checkPreflight(txBase64: string): Promise<any> {
  console.log("--- Step 3: Preflight Risk Check (0.10 USDC) ---");
  const res = await fetchWithPayment(`${API_BASE}/tx/preflight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tx_base64: txBase64 }),
  });
  const data = await res.json();
  console.log(`Request ID:  ${data.request_id}`);
  console.log(`Risk Score:  ${data.risk_score}`);
  console.log(`Partial:     ${data.partial}`);
  console.log(`Rules:`);
  for (const flag of data.flags || []) {
    const icon = flag.status === "TRIGGERED" ? "!!" : flag.status === "OK" ? "OK" : "--";
    console.log(`  [${icon}] ${flag.rule} ${flag.code}: ${flag.detail || ""}`);
  }
  console.log("");
  return data;
}

async function buildSampleTx(): Promise<string> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey("11111111111111111111111111111111"),
      lamports: 1000,
    })
  );
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

async function main() {
  const healthy = await checkHealth();
  if (!healthy) { console.log("Server is down. Exiting."); return; }

  const status = await checkNetworkStatus();
  if (status.rpc_ok_rate_1m < 0.9) { console.log("Network degraded. Skipping."); return; }

  console.log("Building sample transaction...");
  const txBase64 = await buildSampleTx();
  console.log(`TX base64 length: ${txBase64.length}\n`);

  const preflight = await checkPreflight(txBase64);

  console.log("--- Step 4: Decision ---");
  if (preflight.risk_score >= RISK_THRESHOLD) {
    console.log(`HOLD — risk_score ${preflight.risk_score} >= ${RISK_THRESHOLD}`);
  } else {
    console.log(`SEND — risk_score ${preflight.risk_score} < ${RISK_THRESHOLD}`);
  }

  console.log(`\nTotal cost: 0.11 USDC (0.01 status + 0.10 preflight)`);
}

main().catch((err) => { console.error("Error:", err.message || err); process.exit(1); });

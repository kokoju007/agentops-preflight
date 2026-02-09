import dotenv from 'dotenv';
dotenv.config();

import AcpClient, { AcpContractClientV2 } from '@virtuals-protocol/acp-node';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const WHITELISTED_WALLET_PRIVATE_KEY = process.env.WHITELISTED_WALLET_PRIVATE_KEY;
const SELLER_AGENT_WALLET_ADDRESS = process.env.SELLER_AGENT_WALLET_ADDRESS as `0x${string}` | undefined;
const SELLER_ENTITY_ID = process.env.SELLER_ENTITY_ID;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
const PREFLIGHT_API_URL = process.env.PREFLIGHT_API_URL || 'http://127.0.0.1:3000';

// Fail-fast checks
if (!WHITELISTED_WALLET_PRIVATE_KEY) {
  console.error('[seller] WHITELISTED_WALLET_PRIVATE_KEY is required');
  process.exit(1);
}
if (!SELLER_AGENT_WALLET_ADDRESS) {
  console.error('[seller] SELLER_AGENT_WALLET_ADDRESS is required');
  process.exit(1);
}
if (!SELLER_ENTITY_ID) {
  console.error('[seller] SELLER_ENTITY_ID is required');
  process.exit(1);
}
if (!INTERNAL_SECRET) {
  console.error('[seller] INTERNAL_SECRET is required. Get it from the preflight server startup log.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Internal preflight API call
// ---------------------------------------------------------------------------
async function callInternalPreflight(txBase64: string): Promise<any> {
  const url = `${PREFLIGHT_API_URL}/internal/tx/preflight`;
  console.log(`[seller] Calling internal preflight: ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-INTERNAL-SECRET': INTERNAL_SECRET!,
      },
      body: JSON.stringify({ transaction: txBase64 }),
      signal: controller.signal,
    });

    const body = await res.json();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('[seller] Initializing ACP Seller Runner...');
  console.log(`[seller] Agent wallet: ${SELLER_AGENT_WALLET_ADDRESS}`);
  console.log(`[seller] Preflight API: ${PREFLIGHT_API_URL}`);

  const acpContractClient = await AcpContractClientV2.build(
    WHITELISTED_WALLET_PRIVATE_KEY! as `0x${string}`,
    Number(SELLER_ENTITY_ID),
    SELLER_AGENT_WALLET_ADDRESS!,
  );

  const acpClient = new AcpClient({
    acpContractClient,
    onNewTask: async (job) => {
      console.log(`[seller] New job received: id=${job.id}`);

      try {
        // Accept the job
        await job.accept('Ready to analyze.');
        console.log('[seller] Job accepted');

        // Extract tx_base64 from job memo / serviceRequirement
        let txBase64: string | undefined;

        // The buyer passes serviceRequirement as an object; the SDK
        // serialises it into the memo. Try multiple access patterns.
        const memo = job.memos?.[0];
        if (memo) {
          // memo.content is typically a JSON string
          const content = (memo as any).content;
          let parsed: any = content;
          if (typeof content === 'string') {
            try { parsed = JSON.parse(content); } catch { /* keep as-is */ }
          }

          // Look for serviceRequirement → tx_base64
          const sr = parsed?.serviceRequirement ?? parsed;
          if (typeof sr === 'string') {
            try {
              const inner = JSON.parse(sr);
              txBase64 = inner.tx_base64;
            } catch {
              txBase64 = sr; // might be the base64 itself
            }
          } else if (sr && typeof sr === 'object') {
            txBase64 = sr.tx_base64;
          }
        }

        if (!txBase64) {
          console.error('[seller] Could not extract tx_base64 from job memo');
          await job.reject('Missing tx_base64 in service requirement');
          return;
        }

        console.log(`[seller] tx_base64 extracted (length=${txBase64.length})`);

        // Call internal preflight API
        const result = await callInternalPreflight(txBase64);
        console.log(`[seller] Preflight result: risk_score=${result.risk_score}, partial=${result.partial}`);

        // Deliver result
        // deliver() accepts string | Record<string, unknown>.
        // We pass an object with result_json as a JSON string for structured access.
        await job.deliver({ result_json: JSON.stringify(result) });
        console.log('[seller] Deliverable submitted');
      } catch (err: any) {
        console.error('[seller] Job processing failed:', err);
        try {
          await job.reject('Analysis failed: ' + (err.message || String(err)));
        } catch (rejectErr) {
          console.error('[seller] Failed to reject job:', rejectErr);
        }
      }
    },
    // onEvaluate is intentionally omitted — evaluation is done by the buyer.
  });

  await acpClient.init();
  console.log('[seller] ACP Seller Runner is listening for jobs...');
}

main().catch((err) => {
  console.error('[seller] Fatal error:', err);
  process.exit(1);
});

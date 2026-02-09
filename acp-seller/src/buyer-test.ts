import dotenv from 'dotenv';
dotenv.config();

import AcpClient, {
  AcpContractClientV2,
  AcpGraduationStatus,
  AcpOnlineStatus,
  AcpJobPhases,
} from '@virtuals-protocol/acp-node';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const BUYER_WALLET_PRIVATE_KEY = process.env.BUYER_WALLET_PRIVATE_KEY;
const BUYER_AGENT_WALLET_ADDRESS = process.env.BUYER_AGENT_WALLET_ADDRESS as `0x${string}` | undefined;
const BUYER_ENTITY_ID = process.env.BUYER_ENTITY_ID;
const SELLER_AGENT_WALLET_ADDRESS = process.env.SELLER_AGENT_WALLET_ADDRESS as `0x${string}` | undefined;

if (!BUYER_WALLET_PRIVATE_KEY) {
  console.error('[buyer] BUYER_WALLET_PRIVATE_KEY is required');
  process.exit(1);
}
if (!BUYER_AGENT_WALLET_ADDRESS) {
  console.error('[buyer] BUYER_AGENT_WALLET_ADDRESS is required');
  process.exit(1);
}
if (!BUYER_ENTITY_ID) {
  console.error('[buyer] BUYER_ENTITY_ID is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Polling helper
// ---------------------------------------------------------------------------
const TERMINAL_PHASES = new Set([
  AcpJobPhases.COMPLETED,
  AcpJobPhases.REJECTED,
  AcpJobPhases.EXPIRED,
]);

async function pollJobCompletion(
  acpClient: AcpClient,
  jobId: number,
  intervalMs = 10_000,
  maxMs = 5 * 60 * 1000,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const job = await acpClient.getJobById(jobId);
      const phase = job?.phase;
      console.log(`[buyer] Job ${jobId} phase: ${phase ?? 'unknown'} (${AcpJobPhases[phase as number] ?? '?'})`);

      if (phase !== undefined && TERMINAL_PHASES.has(phase)) {
        return job;
      }
    } catch (err: any) {
      console.warn(`[buyer] Polling error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  console.error('[buyer] Polling timed out after 5 minutes');
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('[buyer] Initializing ACP Buyer Test...');

  const acpContractClient = await AcpContractClientV2.build(
    BUYER_WALLET_PRIVATE_KEY! as `0x${string}`,
    Number(BUYER_ENTITY_ID),
    BUYER_AGENT_WALLET_ADDRESS!,
  );

  const acpClient = new AcpClient({
    acpContractClient,
    onEvaluate: async (job) => {
      console.log('[buyer] Evaluating deliverable:', job.deliverable);

      // Deliverable may be an object { result_json: "<inner JSON>" }
      // or a string containing the same structure.
      try {
        let outer: any = job.deliverable;
        if (typeof outer === 'string') {
          outer = JSON.parse(outer);
        }
        const result = JSON.parse(outer.result_json);
        console.log(`[buyer] Parsed result: risk_score=${result.risk_score}, partial=${result.partial}`);
      } catch {
        console.log('[buyer] Could not parse deliverable for display (still accepting)');
      }

      await job.evaluate(true, 'Deliverable accepted. Risk assessment received.');
      console.log('[buyer] Evaluation submitted: ACCEPTED');
    },
  });

  await acpClient.init();
  console.log('[buyer] ACP Buyer initialized');

  // Test transaction (dummy — minimal valid-looking Solana tx)
  const TX_BASE64 = 'AQAAAA==';

  // -----------------------------------------------------------------------
  // Try browseAgents first, fallback to direct initiateJob
  // -----------------------------------------------------------------------
  let jobId: number | undefined;

  try {
    console.log('[buyer] Searching for preflight agents...');
    const relevantAgents = await acpClient.browseAgents('preflight', {
      top_k: 5,
      graduationStatus: AcpGraduationStatus.ALL,
      onlineStatus: AcpOnlineStatus.ALL,
      showHiddenOfferings: true,
    });

    console.log(`[buyer] Found ${relevantAgents?.length ?? 0} agents`);

    if (relevantAgents && relevantAgents.length > 0) {
      const chosenAgent = relevantAgents[0];
      console.log(`[buyer] Chosen agent: ${chosenAgent.walletAddress || chosenAgent.id}`);

      const chosenJobOffering = chosenAgent.jobOfferings?.[0];
      if (chosenJobOffering) {
        console.log(`[buyer] Using offering: ${chosenJobOffering.name || 'first'}`);
        jobId = await chosenJobOffering.initiateJob(
          { tx_base64: TX_BASE64 },
          BUYER_AGENT_WALLET_ADDRESS!,
          new Date(Date.now() + 24 * 60 * 60 * 1000),
        );
        console.log(`[buyer] Job initiated via browseAgents: jobId=${jobId}`);
      }
    }
  } catch (err: any) {
    console.warn(`[buyer] browseAgents failed: ${err.message}`);
  }

  // Fallback: direct initiateJob if browseAgents returned nothing
  if (jobId === undefined) {
    if (!SELLER_AGENT_WALLET_ADDRESS) {
      console.error('[buyer] SELLER_AGENT_WALLET_ADDRESS is required for direct initiateJob fallback');
      process.exit(1);
    }

    console.log(`[buyer] Falling back to direct initiateJob with provider: ${SELLER_AGENT_WALLET_ADDRESS}`);

    // fareAmount requires a FareAmountBase; use 1 USDC via fromContractAddress
    const { FareAmountBase } = await import('@virtuals-protocol/acp-node');
    // Base Sepolia USDC address used by ACP sandbox
    const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`;
    const fareAmount = await FareAmountBase.fromContractAddress(1, USDC_ADDRESS);

    jobId = await acpClient.initiateJob(
      SELLER_AGENT_WALLET_ADDRESS!,
      { tx_base64: TX_BASE64 },
      fareAmount,
      BUYER_AGENT_WALLET_ADDRESS!,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    console.log(`[buyer] Job initiated via direct call: jobId=${jobId}`);
  }

  // -----------------------------------------------------------------------
  // Poll for completion
  // -----------------------------------------------------------------------
  console.log('[buyer] Waiting for job completion (polling every 10s, max 5 min)...');
  const finalJob = await pollJobCompletion(acpClient, jobId);

  if (finalJob) {
    console.log('[buyer] Final job phase:', AcpJobPhases[finalJob.phase as number] ?? finalJob.phase);
  } else {
    console.log('[buyer] Job did not complete within timeout');
  }

  console.log('[buyer] Buyer test finished');
  process.exit(0);
}

main().catch((err) => {
  console.error('[buyer] Fatal error:', err);
  process.exit(1);
});

import { v4 as uuidv4 } from 'uuid';
import { config, RULE_SET_VERSION } from '../config';
import { getDb } from '../db/init';
import { Queries } from '../db/queries';
import { parseTransaction } from '../utils/tx-parser';
import { simulateTransaction } from '../utils/simulate';
import { evaluateRules, calculatePriorityFeeBaseline, RuleContext, Evidence } from '../rules/index';

export interface PreflightResult {
  request_id: string;
  computed_at: string;
  rule_set_version: string;
  risk_score: number;
  partial: boolean;
  flags: any[];
  evidence: Evidence[];
}

/**
 * Core preflight analysis logic, shared between the paid /tx/preflight
 * and the internal /internal/tx/preflight endpoints.
 *
 * Returns { status, body } where status is the HTTP status code.
 */
export async function runPreflightAnalysis(
  txBase64: string
): Promise<{ status: number; body: any }> {
  const requestId = uuidv4();
  const computedAt = new Date().toISOString();

  // Step 1: Decode transaction
  let parsed;
  try {
    parsed = parseTransaction(txBase64);
  } catch (err) {
    return {
      status: 400,
      body: {
        error: {
          code: 'invalid_tx',
          message: err instanceof Error ? err.message : 'Failed to decode transaction',
          trace_id: requestId,
        },
      },
    };
  }

  // Step 2: Simulate transaction
  const simResult = await simulateTransaction(parsed.transaction, parsed.feePayer);
  const simulateFailed = simResult.simulateFailed;

  // Step 3: Get background data
  const db = await getDb();
  const queries = new Queries(db);
  const snapshot = queries.getLatestSnapshot();

  // Check snapshot staleness
  let snapshotStale = false;
  let snapshotStaleReason: string | undefined;
  const staleEvidence: Evidence[] = [];

  if (snapshot) {
    const snapshotAge = Date.now() - new Date(snapshot.ts).getTime();
    const staleThreshold = config.WORKER_INTERVAL_MS * config.SNAPSHOT_STALE_MULTIPLIER;

    if (snapshotAge > staleThreshold) {
      snapshotStale = true;
      snapshotStaleReason = 'snapshot_stale';
      staleEvidence.push({
        metric: 'snapshot_age_sec',
        value: Math.round(snapshotAge / 1000),
        threshold: Math.round(staleThreshold / 1000),
        window: 'now',
        source: 'net_health_snapshots',
      });
    }
  }

  // Calculate priority fee baseline from last 10 snapshots
  const recentSnapshots = queries.getLastNSnapshots(10);
  const priorityFeeBaseline = calculatePriorityFeeBaseline(
    recentSnapshots.map(s => s.priority_fee_level)
  );

  // Step 4: Build rule context and evaluate
  const ruleContext: RuleContext = {
    simulateFailed,
    feePayerLamports: simResult.feePayerLamports,
    programIds: parsed.programIds,
    snapshot: {
      available: !!snapshot,
      stale: snapshotStale,
      staleReason: snapshotStaleReason,
      rpc_error_rate_1m: snapshot?.rpc_error_rate_1m,
      rpc_p95_ms_1m: snapshot?.rpc_p95_ms_1m,
      priority_fee_level: snapshot?.priority_fee_level,
      rpc_error_rate_trend_ratio: snapshot?.rpc_error_rate_trend_ratio,
    },
    priorityFeeBaseline,
  };

  const evaluation = evaluateRules(ruleContext);

  // Add stale evidence if applicable
  const allEvidence = [...staleEvidence, ...evaluation.evidence];

  // Step 5: Build response
  const response: PreflightResult = {
    request_id: requestId,
    computed_at: computedAt,
    rule_set_version: RULE_SET_VERSION,
    risk_score: evaluation.riskScore,
    partial: simulateFailed,
    flags: evaluation.flags,
    evidence: allEvidence,
  };

  // Step 6: Log to database
  try {
    queries.insertPreflightLog({
      run_id: requestId,
      computed_at: computedAt,
      payer: parsed.feePayer.toBase58(),
      payment_tx: null,
      rule_set_version: RULE_SET_VERSION,
      request_json: JSON.stringify({ tx_base64: txBase64 }),
      response_json: JSON.stringify(response),
      risk_score: evaluation.riskScore,
    });
  } catch (logErr) {
    console.error('[preflight] Failed to log preflight result:', logErr);
  }

  return { status: 200, body: response };
}

import { evaluateA1 } from './a1-sol-buffer';
import { evaluateA3 } from './a3-program-blacklist';
import { evaluateB1 } from './b1-fee-spike';
import { evaluateB2 } from './b2-rpc-degradation';
import { evaluateC1 } from './c1-trend';
import { RuleContext, RuleFlag, Evidence } from './types';

export { RuleContext, RuleFlag, Evidence } from './types';

export interface RuleEvaluationResult {
  flags: RuleFlag[];
  evidence: Evidence[];
  riskScore: number;
}

// Calculate median from array of numbers
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// Calculate priority fee baseline from snapshots
export function calculatePriorityFeeBaseline(
  priorityFees: (number | null)[]
): number | null {
  const validFees = priorityFees.filter((f): f is number => f !== null && f > 0);
  return median(validFees);
}

// Run all 5 rules in order
export function evaluateRules(ctx: RuleContext): RuleEvaluationResult {
  const flags: RuleFlag[] = [];
  const evidence: Evidence[] = [];

  // Rule A1 - SOL Buffer
  const a1Result = evaluateA1(ctx);
  flags.push(a1Result.flag);
  if (a1Result.evidence) evidence.push(a1Result.evidence);

  // Rule A3 - Program Blacklist
  const a3Result = evaluateA3(ctx);
  flags.push(a3Result.flag);
  if (a3Result.evidence) evidence.push(a3Result.evidence);

  // Rule B1 - Priority Fee Spike
  const b1Result = evaluateB1(ctx);
  flags.push(b1Result.flag);
  if (b1Result.evidence) evidence.push(b1Result.evidence);

  // Rule B2 - RPC Degradation
  const b2Result = evaluateB2(ctx);
  flags.push(b2Result.flag);
  if (b2Result.evidence) evidence.push(b2Result.evidence);

  // Rule C1 - Trend
  const c1Result = evaluateC1(ctx);
  flags.push(c1Result.flag);
  if (c1Result.evidence) evidence.push(c1Result.evidence);

  // Calculate risk score: sum of points for triggered (non-skipped) flags
  // Capped at 100
  const riskScore = Math.min(
    100,
    flags
      .filter(f => f.triggered && !f.skipped)
      .reduce((sum, f) => sum + f.points, 0)
  );

  return {
    flags,
    evidence,
    riskScore,
  };
}

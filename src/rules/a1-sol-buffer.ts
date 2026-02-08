import { config } from '../config';
import { RuleContext, RuleResult } from './types';

const RULE_ID = 'A1';
const RULE_CODE = 'SOL_BUFFER_LOW';
const POINTS = 15;
const LAMPORTS_PER_SOL = 1_000_000_000;

export function evaluateA1(ctx: RuleContext): RuleResult {
  const threshold = config.MIN_SOL_BUFFER;

  // Check if simulate failed
  if (ctx.simulateFailed) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: false,
        skipped: true,
        reason: 'simulate_failed',
      },
    };
  }

  // Check if we have account data
  if (ctx.feePayerLamports === undefined) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: false,
        skipped: true,
        reason: 'no_account_data',
      },
    };
  }

  const postSol = ctx.feePayerLamports / LAMPORTS_PER_SOL;
  const triggered = postSol < threshold;

  if (triggered) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: true,
        observed: postSol,
        threshold: threshold,
        source: 'simulate_response',
        message: `Post-simulation SOL balance (${postSol.toFixed(6)}) is below minimum buffer (${threshold})`,
      },
      evidence: {
        metric: 'post_simulation_sol',
        value: postSol,
        threshold: threshold,
        window: 'tx',
        source: 'simulate_response',
      },
    };
  }

  // Not triggered (sufficient balance)
  return {
    flag: {
      rule: RULE_ID,
      code: RULE_CODE,
      points: POINTS,
      triggered: false,
      observed: postSol,
      threshold: threshold,
      source: 'simulate_response',
    },
  };
}

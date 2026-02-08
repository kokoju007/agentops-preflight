import { config } from '../config';
import { RuleContext, RuleResult } from './types';

const RULE_ID = 'B1';
const RULE_CODE = 'PRIORITY_FEE_SPIKE';
const POINTS = 20;

export function evaluateB1(ctx: RuleContext): RuleResult {
  const multiplierThreshold = config.FEE_SPIKE_MULTIPLIER;

  // Check if snapshot is unavailable
  if (!ctx.snapshot.available) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: false,
        skipped: true,
        reason: 'no_snapshot',
      },
    };
  }

  // Check if snapshot is stale
  if (ctx.snapshot.stale) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: false,
        skipped: true,
        reason: ctx.snapshot.staleReason || 'snapshot_stale',
      },
    };
  }

  // Check if priority fee data is available
  const currentFee = ctx.snapshot.priority_fee_level;
  if (currentFee === null || currentFee === undefined) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: false,
        skipped: true,
        reason: 'priority_fee_data_unavailable',
      },
    };
  }

  // Check if baseline is available
  const baseline = ctx.priorityFeeBaseline;
  if (baseline === null || baseline === undefined || baseline === 0) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: false,
        skipped: true,
        reason: 'no_baseline_data',
      },
    };
  }

  const ratio = currentFee / baseline;
  const triggered = ratio >= multiplierThreshold;

  if (triggered) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: true,
        observed: ratio,
        threshold: multiplierThreshold,
        source: 'net_health_snapshots',
        message: `Priority fee spike detected (${ratio.toFixed(2)}x baseline)`,
      },
      evidence: {
        metric: 'priority_fee_ratio',
        value: ratio,
        threshold: multiplierThreshold,
        window: '10m',
        source: 'net_health_snapshots',
      },
    };
  }

  // Not triggered
  return {
    flag: {
      rule: RULE_ID,
      code: RULE_CODE,
      points: POINTS,
      triggered: false,
      observed: ratio,
      threshold: multiplierThreshold,
      source: 'net_health_snapshots',
    },
  };
}

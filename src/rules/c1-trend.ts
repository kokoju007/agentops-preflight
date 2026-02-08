import { config } from '../config';
import { RuleContext, RuleResult } from './types';

const RULE_ID = 'C1';
const RULE_CODE = 'ERROR_RATE_TREND';
const POINTS = 25;

export function evaluateC1(ctx: RuleContext): RuleResult {
  const trendThreshold = config.TREND_RATIO_THRESHOLD;

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

  // Check if trend data is available
  const trendRatio = ctx.snapshot.rpc_error_rate_trend_ratio;
  if (trendRatio === null || trendRatio === undefined) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: false,
        skipped: true,
        reason: 'no_trend_data',
      },
    };
  }

  const triggered = trendRatio >= trendThreshold;

  if (triggered) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: true,
        observed: trendRatio,
        threshold: trendThreshold,
        source: 'net_health_snapshots',
        message: `Error rate trending up rapidly (${trendRatio.toFixed(1)}x increase in 10 minutes)`,
      },
      evidence: {
        metric: 'rpc_error_rate_trend_ratio',
        value: trendRatio,
        threshold: trendThreshold,
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
      observed: trendRatio,
      threshold: trendThreshold,
      source: 'net_health_snapshots',
    },
  };
}

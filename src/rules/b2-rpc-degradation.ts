import { config } from '../config';
import { RuleContext, RuleResult, Evidence } from './types';

const RULE_ID = 'B2';
const RULE_CODE = 'RPC_DEGRADATION';
const POINTS = 30;

export function evaluateB2(ctx: RuleContext): RuleResult {
  const errorRateMax = config.RPC_ERROR_RATE_MAX;
  const p95Max = config.RPC_P95_MS_MAX;

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

  const errorRate = ctx.snapshot.rpc_error_rate_1m ?? 0;
  const p95 = ctx.snapshot.rpc_p95_ms_1m ?? 0;

  const errorRateTriggered = errorRate > errorRateMax;
  const p95Triggered = p95 > p95Max;
  const triggered = errorRateTriggered || p95Triggered;

  if (triggered) {
    let message = 'RPC degradation detected:';
    const evidenceItems: Evidence[] = [];

    if (errorRateTriggered) {
      message += ` error rate ${(errorRate * 100).toFixed(1)}% > ${(errorRateMax * 100).toFixed(1)}%`;
      evidenceItems.push({
        metric: 'rpc_error_rate_1m',
        value: errorRate,
        threshold: errorRateMax,
        window: '1m',
        source: 'net_health_snapshots',
      });
    }

    if (p95Triggered) {
      message += errorRateTriggered ? ',' : '';
      message += ` p95 latency ${p95}ms > ${p95Max}ms`;
      evidenceItems.push({
        metric: 'rpc_p95_ms_1m',
        value: p95,
        threshold: p95Max,
        window: '1m',
        source: 'net_health_snapshots',
      });
    }

    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: true,
        observed: errorRateTriggered ? errorRate : p95,
        threshold: errorRateTriggered ? errorRateMax : p95Max,
        source: 'net_health_snapshots',
        message,
      },
      // Return first evidence item (primary trigger)
      evidence: evidenceItems[0],
    };
  }

  // Not triggered
  return {
    flag: {
      rule: RULE_ID,
      code: RULE_CODE,
      points: POINTS,
      triggered: false,
      observed: errorRate,
      threshold: errorRateMax,
      source: 'net_health_snapshots',
    },
  };
}

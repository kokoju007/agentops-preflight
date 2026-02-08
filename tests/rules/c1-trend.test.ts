import { describe, it, expect } from 'vitest';
import { evaluateC1 } from '../../src/rules/c1-trend';
import { RuleContext } from '../../src/rules/types';

const baseContext: RuleContext = {
  simulateFailed: false,
  programIds: [],
  snapshot: { available: true, stale: false },
};

describe('Rule C1 - Trend', () => {
  it('should trigger when trend ratio exceeds threshold', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_trend_ratio: 4.0, // > 3.0 default threshold
      },
    };

    const result = evaluateC1(ctx);

    expect(result.flag.rule).toBe('C1');
    expect(result.flag.code).toBe('ERROR_RATE_TREND');
    expect(result.flag.triggered).toBe(true);
    expect(result.flag.points).toBe(25);
    expect(result.evidence).toBeDefined();
  });

  it('should not trigger when trend is stable', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_trend_ratio: 1.5, // < 3.0 threshold
      },
    };

    const result = evaluateC1(ctx);

    expect(result.flag.rule).toBe('C1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBeUndefined();
  });

  it('should skip when trend data is null', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_trend_ratio: null,
      },
    };

    const result = evaluateC1(ctx);

    expect(result.flag.rule).toBe('C1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('no_trend_data');
  });

  it('should skip when snapshot is stale', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: true,
        staleReason: 'snapshot_stale',
        rpc_error_rate_trend_ratio: 4.0,
      },
    };

    const result = evaluateC1(ctx);

    expect(result.flag.rule).toBe('C1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('snapshot_stale');
  });

  it('should skip when no snapshot available', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: false,
        stale: false,
      },
    };

    const result = evaluateC1(ctx);

    expect(result.flag.rule).toBe('C1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('no_snapshot');
  });
});

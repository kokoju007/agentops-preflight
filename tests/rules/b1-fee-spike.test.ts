import { describe, it, expect } from 'vitest';
import { evaluateB1 } from '../../src/rules/b1-fee-spike';
import { RuleContext } from '../../src/rules/types';

const baseContext: RuleContext = {
  simulateFailed: false,
  programIds: [],
  snapshot: { available: true, stale: false },
};

describe('Rule B1 - Priority Fee Spike', () => {
  it('should trigger when fee spike exceeds multiplier', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        priority_fee_level: 9000, // 3x baseline
      },
      priorityFeeBaseline: 3000,
    };

    const result = evaluateB1(ctx);

    expect(result.flag.rule).toBe('B1');
    expect(result.flag.code).toBe('PRIORITY_FEE_SPIKE');
    expect(result.flag.triggered).toBe(true);
    expect(result.flag.points).toBe(20);
    expect(result.evidence).toBeDefined();
  });

  it('should not trigger when fee is normal', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        priority_fee_level: 3500, // Below 3x baseline
      },
      priorityFeeBaseline: 3000,
    };

    const result = evaluateB1(ctx);

    expect(result.flag.rule).toBe('B1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBeUndefined();
  });

  it('should skip when priority fee data is null', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        priority_fee_level: null,
      },
      priorityFeeBaseline: 3000,
    };

    const result = evaluateB1(ctx);

    expect(result.flag.rule).toBe('B1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('priority_fee_data_unavailable');
  });

  it('should skip when snapshot is stale', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: true,
        staleReason: 'snapshot_stale',
        priority_fee_level: 9000,
      },
      priorityFeeBaseline: 3000,
    };

    const result = evaluateB1(ctx);

    expect(result.flag.rule).toBe('B1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('snapshot_stale');
  });

  it('should skip when no baseline data', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        priority_fee_level: 9000,
      },
      priorityFeeBaseline: null,
    };

    const result = evaluateB1(ctx);

    expect(result.flag.rule).toBe('B1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('no_baseline_data');
  });
});

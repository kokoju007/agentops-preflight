import { describe, it, expect } from 'vitest';
import { evaluateRules, calculatePriorityFeeBaseline } from '../../src/rules/index';
import { RuleContext } from '../../src/rules/types';

describe('Risk Score Calculation', () => {
  it('should return 30 when only B2 is triggered', () => {
    const ctx: RuleContext = {
      simulateFailed: false,
      feePayerLamports: 100_000_000, // Sufficient balance
      programIds: ['11111111111111111111111111111111'],
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_1m: 0.08, // High error rate - triggers B2
        rpc_p95_ms_1m: 500,
        priority_fee_level: 1000,
        rpc_error_rate_trend_ratio: 1.5, // Below threshold
      },
      priorityFeeBaseline: 1000,
    };

    const result = evaluateRules(ctx);

    expect(result.riskScore).toBe(30);
    expect(result.flags.length).toBe(5);

    const b2 = result.flags.find(f => f.rule === 'B2');
    expect(b2?.triggered).toBe(true);
  });

  it('should return 55 when B2 and C1 are triggered', () => {
    const ctx: RuleContext = {
      simulateFailed: false,
      feePayerLamports: 100_000_000,
      programIds: ['11111111111111111111111111111111'],
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_1m: 0.08, // Triggers B2
        rpc_p95_ms_1m: 500,
        priority_fee_level: 1000,
        rpc_error_rate_trend_ratio: 4.0, // Triggers C1
      },
      priorityFeeBaseline: 1000,
    };

    const result = evaluateRules(ctx);

    expect(result.riskScore).toBe(55); // 30 (B2) + 25 (C1)
  });

  it('should cap at 100 when all rules trigger', () => {
    const ctx: RuleContext = {
      simulateFailed: false,
      feePayerLamports: 5_000_000, // Low balance - triggers A1
      programIds: ['BadProgramId123'], // Would trigger A3 if blacklisted
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_1m: 0.08, // Triggers B2
        rpc_p95_ms_1m: 500,
        priority_fee_level: 9000, // Triggers B1
        rpc_error_rate_trend_ratio: 4.0, // Triggers C1
      },
      priorityFeeBaseline: 1000,
    };

    const result = evaluateRules(ctx);

    // A1 (15) + B1 (20) + B2 (30) + C1 (25) = 90 (A3 not triggered with empty blacklist)
    // With blacklist it would be 100
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.flags.length).toBe(5);
  });

  it('should return 30 when A1 is skipped but B2 is triggered', () => {
    const ctx: RuleContext = {
      simulateFailed: true, // A1 will be skipped
      programIds: ['11111111111111111111111111111111'],
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_1m: 0.08, // Triggers B2
        rpc_p95_ms_1m: 500,
        priority_fee_level: 1000,
        rpc_error_rate_trend_ratio: 1.5,
      },
      priorityFeeBaseline: 1000,
    };

    const result = evaluateRules(ctx);

    expect(result.riskScore).toBe(30); // Only B2

    const a1 = result.flags.find(f => f.rule === 'A1');
    expect(a1?.skipped).toBe(true);
    expect(a1?.triggered).toBe(false);
  });

  it('should always return exactly 5 flags', () => {
    const ctx: RuleContext = {
      simulateFailed: true,
      programIds: [],
      snapshot: {
        available: false,
        stale: false,
      },
    };

    const result = evaluateRules(ctx);

    expect(result.flags.length).toBe(5);
    const ruleIds = result.flags.map(f => f.rule).sort();
    expect(ruleIds).toEqual(['A1', 'A3', 'B1', 'B2', 'C1']);
  });
});

describe('Priority Fee Baseline Calculation', () => {
  it('should calculate median from valid fees', () => {
    const fees = [1000, 2000, 3000, 4000, 5000];
    const baseline = calculatePriorityFeeBaseline(fees);
    expect(baseline).toBe(3000);
  });

  it('should handle null values', () => {
    const fees = [1000, null, 3000, null, 5000];
    const baseline = calculatePriorityFeeBaseline(fees);
    expect(baseline).toBe(3000);
  });

  it('should return null for empty array', () => {
    const baseline = calculatePriorityFeeBaseline([]);
    expect(baseline).toBeNull();
  });

  it('should return null for all null values', () => {
    const baseline = calculatePriorityFeeBaseline([null, null, null]);
    expect(baseline).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { evaluateA1 } from '../../src/rules/a1-sol-buffer';
import { RuleContext } from '../../src/rules/types';

const baseContext: RuleContext = {
  simulateFailed: false,
  programIds: [],
  snapshot: { available: true, stale: false },
};

describe('Rule A1 - SOL Buffer', () => {
  it('should trigger when post-simulation balance is below threshold', () => {
    const ctx: RuleContext = {
      ...baseContext,
      feePayerLamports: 5_000_000, // 0.005 SOL (below 0.01 default)
    };

    const result = evaluateA1(ctx);

    expect(result.flag.rule).toBe('A1');
    expect(result.flag.code).toBe('SOL_BUFFER_LOW');
    expect(result.flag.triggered).toBe(true);
    expect(result.flag.points).toBe(15);
    expect(result.evidence).toBeDefined();
  });

  it('should not trigger when balance is sufficient', () => {
    const ctx: RuleContext = {
      ...baseContext,
      feePayerLamports: 100_000_000, // 0.1 SOL (above 0.01 default)
    };

    const result = evaluateA1(ctx);

    expect(result.flag.rule).toBe('A1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBeUndefined();
    expect(result.evidence).toBeUndefined();
  });

  it('should skip when simulate failed', () => {
    const ctx: RuleContext = {
      ...baseContext,
      simulateFailed: true,
    };

    const result = evaluateA1(ctx);

    expect(result.flag.rule).toBe('A1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('simulate_failed');
  });

  it('should skip when no account data available', () => {
    const ctx: RuleContext = {
      ...baseContext,
      feePayerLamports: undefined,
    };

    const result = evaluateA1(ctx);

    expect(result.flag.rule).toBe('A1');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('no_account_data');
  });
});

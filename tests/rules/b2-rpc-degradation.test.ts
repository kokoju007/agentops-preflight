import { describe, it, expect } from 'vitest';
import { evaluateB2 } from '../../src/rules/b2-rpc-degradation';
import { RuleContext } from '../../src/rules/types';

const baseContext: RuleContext = {
  simulateFailed: false,
  programIds: [],
  snapshot: { available: true, stale: false },
};

describe('Rule B2 - RPC Degradation', () => {
  it('should trigger when error rate exceeds threshold', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_1m: 0.08, // 8% > 3% default threshold
        rpc_p95_ms_1m: 500, // Normal
      },
    };

    const result = evaluateB2(ctx);

    expect(result.flag.rule).toBe('B2');
    expect(result.flag.code).toBe('RPC_DEGRADATION');
    expect(result.flag.triggered).toBe(true);
    expect(result.flag.points).toBe(30);
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.metric).toBe('rpc_error_rate_1m');
  });

  it('should trigger when p95 latency exceeds threshold', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_1m: 0.01, // Normal
        rpc_p95_ms_1m: 1500, // > 1200ms default threshold
      },
    };

    const result = evaluateB2(ctx);

    expect(result.flag.rule).toBe('B2');
    expect(result.flag.triggered).toBe(true);
    expect(result.evidence!.metric).toBe('rpc_p95_ms_1m');
  });

  it('should not trigger when metrics are healthy', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: false,
        rpc_error_rate_1m: 0.01, // 1% < 3%
        rpc_p95_ms_1m: 500, // < 1200ms
      },
    };

    const result = evaluateB2(ctx);

    expect(result.flag.rule).toBe('B2');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBeUndefined();
  });

  it('should skip when no snapshot available', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: false,
        stale: false,
      },
    };

    const result = evaluateB2(ctx);

    expect(result.flag.rule).toBe('B2');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('no_snapshot');
  });

  it('should skip when snapshot is stale', () => {
    const ctx: RuleContext = {
      ...baseContext,
      snapshot: {
        available: true,
        stale: true,
        staleReason: 'snapshot_stale',
        rpc_error_rate_1m: 0.08,
        rpc_p95_ms_1m: 1500,
      },
    };

    const result = evaluateB2(ctx);

    expect(result.flag.rule).toBe('B2');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBe(true);
    expect(result.flag.reason).toBe('snapshot_stale');
  });
});

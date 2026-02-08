import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RuleContext } from '../../src/rules/types';

// We need to mock config for this test
vi.mock('../../src/config', () => ({
  config: {
    PROGRAM_BLACKLIST_JSON: [],
  },
}));

import { evaluateA3 } from '../../src/rules/a3-program-blacklist';
import { config } from '../../src/config';

const baseContext: RuleContext = {
  simulateFailed: false,
  programIds: ['11111111111111111111111111111111'], // System program
  snapshot: { available: true, stale: false },
};

describe('Rule A3 - Program Blacklist', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should trigger when transaction contains blacklisted program', () => {
    // @ts-ignore - mocking config
    config.PROGRAM_BLACKLIST_JSON = ['BadProgramId123'];

    const ctx: RuleContext = {
      ...baseContext,
      programIds: ['11111111111111111111111111111111', 'BadProgramId123'],
    };

    const result = evaluateA3(ctx);

    expect(result.flag.rule).toBe('A3');
    expect(result.flag.code).toBe('BLACKLISTED_PROGRAM');
    expect(result.flag.triggered).toBe(true);
    expect(result.flag.points).toBe(10);
    expect(result.evidence).toBeDefined();
  });

  it('should not trigger when no blacklisted programs', () => {
    // @ts-ignore - mocking config
    config.PROGRAM_BLACKLIST_JSON = ['BadProgramId123'];

    const ctx: RuleContext = {
      ...baseContext,
      programIds: ['11111111111111111111111111111111', 'GoodProgram456'],
    };

    const result = evaluateA3(ctx);

    expect(result.flag.rule).toBe('A3');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBeUndefined();
  });

  it('should pass when blacklist is empty', () => {
    // @ts-ignore - mocking config
    config.PROGRAM_BLACKLIST_JSON = [];

    const ctx: RuleContext = {
      ...baseContext,
      programIds: ['AnyProgram123'],
    };

    const result = evaluateA3(ctx);

    expect(result.flag.rule).toBe('A3');
    expect(result.flag.triggered).toBe(false);
    expect(result.flag.skipped).toBeUndefined();
  });
});

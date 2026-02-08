import { config } from '../config';
import { RuleContext, RuleResult } from './types';

const RULE_ID = 'A3';
const RULE_CODE = 'BLACKLISTED_PROGRAM';
const POINTS = 10;

export function evaluateA3(ctx: RuleContext): RuleResult {
  const blacklist = config.PROGRAM_BLACKLIST_JSON;

  // If blacklist is empty, rule passes
  if (!blacklist || blacklist.length === 0) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: false,
        observed: 0,
        threshold: 1,
        source: 'transaction',
        message: 'No blacklist configured',
      },
    };
  }

  // Find any blacklisted programs
  const blacklistedFound = ctx.programIds.filter(pid => blacklist.includes(pid));
  const triggered = blacklistedFound.length > 0;

  if (triggered) {
    return {
      flag: {
        rule: RULE_ID,
        code: RULE_CODE,
        points: POINTS,
        triggered: true,
        observed: blacklistedFound.join(', '),
        threshold: 'none allowed',
        source: 'transaction',
        message: `Transaction contains blacklisted program(s): ${blacklistedFound.join(', ')}`,
      },
      evidence: {
        metric: 'blacklisted_program_count',
        value: blacklistedFound.length,
        threshold: 0,
        window: 'tx',
        source: 'transaction',
      },
    };
  }

  // Not triggered (no blacklisted programs)
  return {
    flag: {
      rule: RULE_ID,
      code: RULE_CODE,
      points: POINTS,
      triggered: false,
      observed: 0,
      threshold: 1,
      source: 'transaction',
    },
  };
}

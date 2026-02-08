import { describe, it, expect } from 'vitest';

// Test config module can be imported (zod validation works)
describe('Config', () => {
  it('should load config with defaults when minimal env is set', async () => {
    // Config is loaded at module import time, but we can test that it exported properly
    const { config, getRpcUrls, RULE_SET_VERSION } = await import('../src/config');

    expect(config).toBeDefined();
    expect(config.PORT).toBe(3000);
    expect(config.MIN_SOL_BUFFER).toBe(0.01);
    expect(config.FEE_SPIKE_MULTIPLIER).toBe(3.0);
    expect(config.RPC_ERROR_RATE_MAX).toBe(0.03);
    expect(config.RPC_P95_MS_MAX).toBe(1200);
    expect(config.TREND_RATIO_THRESHOLD).toBe(3.0);
    expect(config.RATE_LIMIT_RPM).toBe(60);
    expect(config.WORKER_INTERVAL_MS).toBe(60000);
    expect(config.SNAPSHOT_STALE_MULTIPLIER).toBe(3);
    expect(Array.isArray(config.PROGRAM_BLACKLIST_JSON)).toBe(true);

    // X402_PAYTO_SOLANA should be set from .env
    expect(config.X402_PAYTO_SOLANA).toBeDefined();
    expect(config.X402_PAYTO_SOLANA.length).toBeGreaterThan(0);

    expect(RULE_SET_VERSION).toBe('rev-final-1.0.0');
  });

  it('should return RPC URLs in fallback order', async () => {
    const { getRpcUrls, config } = await import('../src/config');
    const urls = getRpcUrls();

    expect(Array.isArray(urls)).toBe(true);
    expect(urls.length).toBeGreaterThanOrEqual(1);
    expect(urls[0]).toBe(config.RPC_PRIMARY_URL);
  });
});

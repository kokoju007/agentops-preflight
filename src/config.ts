import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),

  // Server base URL (for x402 resource URL in 402 responses)
  BASE_URL: z.string().optional().default(''),

  // x402
  X402_FACILITATOR_URL: z.string().default('https://x402.org/facilitator'),
  X402_NETWORK_ID: z.string().default(''),
  X402_PAYTO_SOLANA: z.string().optional().default(''),
  PRICE_PREFLIGHT_USDC: z.coerce.number().default(0.10),
  PRICE_STATUS_USDC: z.coerce.number().default(0.01),

  // CDP (for Coinbase facilitator auth)
  CDP_API_KEY_ID: z.string().optional().default(''),
  CDP_API_KEY_SECRET: z.string().optional().default(''),

  // Solana RPC
  RPC_PRIMARY_URL: z.string().url().default('https://api.devnet.solana.com'),
  RPC_SECONDARY_URL: z.string().optional().default(''),
  RPC_TERTIARY_URL: z.string().optional().default(''),
  RPC_FALLBACK_URL: z.string().optional().default(''),

  // Network
  NETWORK: z.string().default('devnet'),

  // Server wallet (optional)
  SERVER_WALLET_KEYPAIR: z.string().optional().default(''),

  // Database
  SQLITE_PATH: z.string().default('./data/app.db'),

  // Rules
  MIN_SOL_BUFFER: z.coerce.number().default(0.01),
  FEE_SPIKE_MULTIPLIER: z.coerce.number().default(3.0),
  RPC_ERROR_RATE_MAX: z.coerce.number().default(0.03),
  RPC_P95_MS_MAX: z.coerce.number().default(1200),
  TREND_RATIO_THRESHOLD: z.coerce.number().default(3.0),
  PROGRAM_BLACKLIST_JSON: z.string().default('[]').transform((val) => {
    try {
      return JSON.parse(val) as string[];
    } catch {
      return [];
    }
  }),

  // Rate limiting
  RATE_LIMIT_RPM: z.coerce.number().default(60),

  // Worker
  WORKER_INTERVAL_MS: z.coerce.number().default(60000),
  SNAPSHOT_STALE_MULTIPLIER: z.coerce.number().default(3),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    throw new Error('Invalid environment configuration');
  }

  return result.data;
}

export const config = loadConfig();

// Helper to get RPC URLs in fallback order
export function getRpcUrls(): string[] {
  const urls: string[] = [];
  if (config.RPC_PRIMARY_URL) urls.push(config.RPC_PRIMARY_URL);
  if (config.RPC_FALLBACK_URL) urls.push(config.RPC_FALLBACK_URL);
  if (config.RPC_SECONDARY_URL) urls.push(config.RPC_SECONDARY_URL);
  if (config.RPC_TERTIARY_URL) urls.push(config.RPC_TERTIARY_URL);
  return urls;
}

// Rule set version
export const RULE_SET_VERSION = 'rev-final-1.0.0';

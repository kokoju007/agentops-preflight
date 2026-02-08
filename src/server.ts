import express from 'express';
import rateLimit from 'express-rate-limit';
import * as fs from 'fs';
import { Connection, PublicKey as SolPublicKey } from '@solana/web3.js';
import { config } from './config';
import { getDb, closeDb } from './db/init';
import { createApiError } from './utils/errors';
import { startWorker, stopWorker } from './worker/worker';

// Routes
import demoRoutes from './routes/demo';
import statusRoutes from './routes/status';
import preflightRoutes from './routes/preflight';

// x402 imports - use require due to subpath export issues with ts-node
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
const { HTTPFacilitatorClient } = require('@x402/core/server') as {
  HTTPFacilitatorClient: new (config?: { url?: string; createAuthHeaders?: () => Promise<Record<string, Record<string, string>>> }) => any;
};
const { registerExactSvmScheme: registerExactSvmSchemeServer } = require('@x402/svm/exact/server') as {
  registerExactSvmScheme: (server: any, config?: { networks?: string[] }) => any;
};
const { ExactSvmScheme: ExactSvmSchemeFacilitator, registerExactSvmScheme: registerExactSvmSchemeFacilitator } = require('@x402/svm/exact/facilitator') as {
  ExactSvmScheme: new (signer: any) => any;
  registerExactSvmScheme: (server: any, config?: { networks?: string[] }) => any;
};
import { SOLANA_DEVNET_CAIP2, SOLANA_MAINNET_CAIP2, toFacilitatorSvmSigner } from '@x402/svm';
import { createKeyPairSignerFromBytes } from '@solana/kit';

// CDP facilitator auth (optional, for Coinbase facilitator)
let createFacilitatorConfig: ((apiKeyId?: string, apiKeySecret?: string) => { url: string; createAuthHeaders: () => Promise<Record<string, Record<string, string>>> }) | undefined;
try {
  createFacilitatorConfig = require('@coinbase/x402').createFacilitatorConfig;
} catch {
  // @coinbase/x402 not installed — CDP facilitator auth not available
}

const app = express();

// Body parser with 64kb limit
app.use(express.json({ limit: '64kb' }));

// Handle body parser errors (oversized body)
app.use((err: Error & { type?: string }, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(400).json(
      createApiError('invalid_request', 'Request body exceeds 64kb limit')
    );
  }
  next(err);
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.RATE_LIMIT_RPM,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(
      createApiError('rate_limited', 'Too many requests. Please try again later.', 60)
    );
  },
});

app.use(limiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Override host header for x402 resource URL when BASE_URL is set
if (config.BASE_URL) {
  app.use((req, _res, next) => {
    try {
      const url = new URL(config.BASE_URL);
      req.headers.host = url.host;
    } catch { /* invalid BASE_URL, skip */ }
    next();
  });
}

// Free demo endpoint (no x402)
app.use('/demo', demoRoutes);

// Setup x402 payment middleware
async function setupX402Routes() {
  const payToAddress = config.X402_PAYTO_SOLANA;

  if (!payToAddress) {
    console.log('[server] X402_PAYTO_SOLANA not set, x402 disabled');

    // Routes without x402
    app.use('/solana/status', statusRoutes);
    app.use('/tx/preflight', preflightRoutes);
    return;
  }

  console.log('[server] Setting up x402 payment middleware...');
  console.log(`[server] Payment address: ${payToAddress}`);

  // Determine network: explicit X402_NETWORK_ID > derived from NETWORK env
  let network: string;
  if (config.X402_NETWORK_ID) {
    network = config.X402_NETWORK_ID;
  } else {
    network = config.NETWORK.startsWith('mainnet') ? SOLANA_MAINNET_CAIP2 : SOLANA_DEVNET_CAIP2;
  }
  console.log(`[server] Network: ${network}`);

  // Create facilitator — local (self-hosted) or remote (CDP/HTTP)
  let facilitator: any;

  if (config.SERVER_WALLET_KEYPAIR) {
    // Local facilitator: use server wallet as fee payer
    // This handles memo instructions correctly (unlike CDP facilitator)
    try {
      const raw = JSON.parse(fs.readFileSync(config.SERVER_WALLET_KEYPAIR, 'utf8'));
      const keypairBytes = Uint8Array.from(raw);
      const signer = await createKeyPairSignerFromBytes(keypairBytes);
      const svmSigner = toFacilitatorSvmSigner(signer, {
        defaultRpcUrl: config.RPC_PRIMARY_URL,
      });

      // Create a local facilitator that implements FacilitatorClient interface
      const schemeFacilitator = new ExactSvmSchemeFacilitator(svmSigner);
      facilitator = {
        verify: (payload: any, requirements: any) => schemeFacilitator.verify(payload, requirements),
        settle: (payload: any, requirements: any) => schemeFacilitator.settle(payload, requirements),
        getSupported: async () => ({
          kinds: [{
            x402Version: 2,
            scheme: 'exact',
            network: network,
            extra: schemeFacilitator.getExtra(network),
          }],
          extensions: [],
          signers: { exact: schemeFacilitator.getSigners(network) },
        }),
      };

      const addresses = svmSigner.getAddresses();
      console.log(`[server] Facilitator: local (fee payer: ${addresses[0]})`);
    } catch (err) {
      console.error('[server] Failed to load server wallet for local facilitator:', err);
      console.log('[server] Falling back to HTTP facilitator');
      facilitator = null;
    }
  }

  if (!facilitator) {
    // Remote facilitator: CDP or default HTTP
    let facilitatorConfig: { url?: string; createAuthHeaders?: () => Promise<Record<string, Record<string, string>>> };

    if (config.CDP_API_KEY_ID && config.CDP_API_KEY_SECRET && createFacilitatorConfig) {
      facilitatorConfig = createFacilitatorConfig(config.CDP_API_KEY_ID, config.CDP_API_KEY_SECRET);
      console.log(`[server] Facilitator: CDP (${facilitatorConfig.url})`);
    } else {
      facilitatorConfig = { url: config.X402_FACILITATOR_URL };
      console.log(`[server] Facilitator: ${config.X402_FACILITATOR_URL}`);
    }

    facilitator = new HTTPFacilitatorClient(facilitatorConfig);
  }

  // Create resource server and register SVM scheme
  const resourceServer = new x402ResourceServer(facilitator);
  registerExactSvmSchemeServer(resourceServer, { networks: [network] });

  // Route configurations - RoutesConfig maps path to RouteConfig with 'accepts' field
  const statusRoutesConfig = {
    '/': {
      accepts: {
        scheme: 'exact',
        network: network,
        price: config.PRICE_STATUS_USDC,
        payTo: payToAddress,
      },
      description: 'Solana network status',
    },
  };

  const preflightRoutesConfig = {
    '/': {
      accepts: {
        scheme: 'exact',
        network: network,
        price: config.PRICE_PREFLIGHT_USDC,
        payTo: payToAddress,
      },
      description: 'Transaction preflight risk assessment',
    },
  };

  // Settlement logging middleware — logs payment results after x402 settle
  const settlementLogger = (endpoint: string, price: number) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const startTime = Date.now();
      res.on('finish', () => {
        const paymentResponseHeader = res.getHeader('payment-response') as string | undefined;
        if (!paymentResponseHeader) return; // No payment (402 or non-paid request)

        const elapsed = Date.now() - startTime;
        try {
          const decoded = JSON.parse(Buffer.from(paymentResponseHeader, 'base64').toString());
          if (decoded.success) {
            console.log(JSON.stringify({
              level: 'info',
              event: 'x402_settlement_ok',
              endpoint,
              price_usdc: price,
              payment_tx: decoded.transaction || decoded.txHash || null,
              payer: req.headers['x-payer'] || 'unknown',
              status: res.statusCode,
              elapsed_ms: elapsed,
              ts: new Date().toISOString(),
            }));
          } else {
            console.error(JSON.stringify({
              level: 'error',
              event: 'x402_settlement_fail',
              endpoint,
              price_usdc: price,
              error_reason: decoded.errorReason || decoded.error || 'unknown',
              payer: req.headers['x-payer'] || 'unknown',
              status: res.statusCode,
              elapsed_ms: elapsed,
              ts: new Date().toISOString(),
            }));
          }
        } catch {
          console.log(`[x402] Settlement response (unparseable) for ${endpoint}: status=${res.statusCode}`);
        }
      });
      next();
    };
  };

  // Apply x402 middleware to status route
  app.use(
    '/solana/status',
    settlementLogger('/solana/status', config.PRICE_STATUS_USDC),
    paymentMiddleware(statusRoutesConfig, resourceServer),
    statusRoutes
  );

  // Apply x402 middleware to preflight route
  app.use(
    '/tx/preflight',
    settlementLogger('/tx/preflight', config.PRICE_PREFLIGHT_USDC),
    paymentMiddleware(preflightRoutesConfig, resourceServer),
    preflightRoutes
  );

  console.log('[server] x402 payment middleware configured');
}

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json(
    createApiError('internal_error', 'An unexpected error occurred')
  );
});

// Check feePayer SOL balance at startup
async function checkFeePayerBalance() {
  if (!config.SERVER_WALLET_KEYPAIR) return;
  try {
    const raw = JSON.parse(fs.readFileSync(config.SERVER_WALLET_KEYPAIR, 'utf8'));
    const keypairBytes = Uint8Array.from(raw);
    // Public key is the last 32 bytes of the 64-byte keypair
    const pubkey = new SolPublicKey(keypairBytes.slice(32));
    const connection = new Connection(config.RPC_PRIMARY_URL, 'confirmed');
    const lamports = await connection.getBalance(pubkey);
    const sol = lamports / 1_000_000_000;
    console.log(`[server] Fee payer SOL balance: ${sol.toFixed(4)} SOL (${pubkey.toBase58()})`);
    if (sol < 0.01) {
      console.warn(`[server] WARNING: Fee payer SOL balance is below 0.01 SOL (${sol.toFixed(6)}). Settlement transactions may fail.`);
    }
  } catch (err) {
    console.warn('[server] Could not check fee payer balance:', err instanceof Error ? err.message : err);
  }
}

// Start server
async function start() {
  try {
    // Initialize database
    await getDb();
    console.log('[server] Database initialized');

    // Setup routes (with or without x402)
    await setupX402Routes();

    // Check fee payer SOL balance
    await checkFeePayerBalance();

    // Start worker
    startWorker();

    // Start listening
    const port = config.PORT;
    app.listen(port, () => {
      console.log(`[server] AgentOps Preflight v1 listening on port ${port}`);
      console.log(`[server] Endpoints:`);
      console.log(`  - GET  /health          (health check)`);
      console.log(`  - GET  /demo/sample     (free)`);
      console.log(`  - GET  /solana/status   (${config.PRICE_STATUS_USDC} USDC)`);
      console.log(`  - POST /tx/preflight    (${config.PRICE_PREFLIGHT_USDC} USDC)`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[server] Received SIGINT, shutting down...');
  stopWorker();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[server] Received SIGTERM, shutting down...');
  stopWorker();
  closeDb();
  process.exit(0);
});

// Export app for testing
export { app };

// Run if main module
if (require.main === module) {
  start();
}

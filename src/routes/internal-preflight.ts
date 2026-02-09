import { Router, Request, Response } from 'express';
import { runPreflightAnalysis } from './preflight-core';
import { createApiError } from '../utils/errors';

const router = Router();

const ALLOWED_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

interface InternalPreflightRequest {
  transaction: string; // base64-encoded transaction
}

// POST /internal/tx/preflight - Internal (loopback-only) preflight endpoint
// No x402 paywall. Guarded by IP allowlist + INTERNAL_SECRET header.
router.post('/', (req: Request, res: Response, next) => {
  // IP guard: only allow loopback addresses
  const remoteAddr = req.socket.remoteAddress || '';
  if (!ALLOWED_IPS.has(remoteAddr)) {
    return res.status(403).json(
      createApiError('forbidden', 'Access denied: non-loopback address')
    );
  }

  // Secret guard
  const secret = req.headers['x-internal-secret'] as string | undefined;
  const expected = process.env.__INTERNAL_SECRET;
  if (!expected || secret !== expected) {
    return res.status(401).json(
      createApiError('unauthorized', 'Invalid or missing X-INTERNAL-SECRET')
    );
  }

  next();
}, async (req: Request, res: Response) => {
  try {
    const body = req.body as InternalPreflightRequest;
    if (!body || typeof body.transaction !== 'string') {
      return res.status(400).json(
        createApiError('invalid_request', 'Request body must contain "transaction" (base64 string)')
      );
    }

    const result = await runPreflightAnalysis(body.transaction);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[internal-preflight] Error:', err);
    res.status(500).json(
      createApiError('internal_error', 'Failed to evaluate transaction')
    );
  }
});

export default router;

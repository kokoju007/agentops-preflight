import { Router, Request, Response } from 'express';
import { runPreflightAnalysis } from './preflight-core';
import { createApiError } from '../utils/errors';

const router = Router();

interface PreflightRequest {
  tx_base64: string;
}

// POST /tx/preflight - Main preflight evaluation endpoint
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const body = req.body as PreflightRequest;
    if (!body || typeof body.tx_base64 !== 'string') {
      return res.status(400).json(
        createApiError('invalid_request', 'Request body must contain tx_base64 string')
      );
    }

    const result = await runPreflightAnalysis(body.tx_base64);

    // Always return 200 (never 503 from preflight)
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[preflight] Error:', err);
    res.status(500).json(
      createApiError('internal_error', 'Failed to evaluate transaction')
    );
  }
});

export default router;

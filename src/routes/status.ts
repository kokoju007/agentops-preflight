import { Router } from 'express';
import { getDb } from '../db/init';
import { Queries } from '../db/queries';
import { createApiError } from '../utils/errors';

const router = Router();

// GET /solana/status - Paid endpoint returning current network status
router.get('/', async (_req, res) => {
  try {
    const db = await getDb();
    const queries = new Queries(db);
    const snapshot = queries.getLatestSnapshot();

    if (!snapshot) {
      // No snapshot available
      return res.status(503).json(
        createApiError('rpc_unavailable', 'No network health data available. Worker may not have run yet.')
      );
    }

    // Return neutral metrics only
    res.json({
      ts: snapshot.ts,
      rpc_ok_rate_1m: snapshot.rpc_ok_rate_1m,
      rpc_error_rate_1m: snapshot.rpc_error_rate_1m,
      rpc_p95_ms_1m: snapshot.rpc_p95_ms_1m,
      priority_fee_level: snapshot.priority_fee_level,
    });
  } catch (err) {
    console.error('[status] Error:', err);
    res.status(500).json(
      createApiError('internal_error', 'Failed to retrieve network status')
    );
  }
});

export default router;

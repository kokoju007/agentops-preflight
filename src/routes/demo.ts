import { Router } from 'express';
import { RULE_SET_VERSION } from '../config';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// GET /demo/sample - Free endpoint returning example response
router.get('/sample', (_req, res) => {
  const exampleResponse = {
    request_id: uuidv4(),
    computed_at: new Date().toISOString(),
    rule_set_version: RULE_SET_VERSION,
    risk_score: 55,
    partial: false,
    flags: [
      {
        rule: 'A1',
        code: 'SOL_BUFFER_LOW',
        points: 15,
        triggered: false,
        observed: 0.5,
        threshold: 0.01,
        source: 'simulate_response',
      },
      {
        rule: 'A3',
        code: 'BLACKLISTED_PROGRAM',
        points: 10,
        triggered: false,
        observed: 0,
        threshold: 1,
        source: 'transaction',
      },
      {
        rule: 'B1',
        code: 'PRIORITY_FEE_SPIKE',
        points: 20,
        triggered: false,
        observed: 1.2,
        threshold: 3.0,
        source: 'net_health_snapshots',
      },
      {
        rule: 'B2',
        code: 'RPC_DEGRADATION',
        points: 30,
        triggered: true,
        observed: 0.08,
        threshold: 0.03,
        source: 'net_health_snapshots',
        message: 'RPC error rate exceeds threshold',
      },
      {
        rule: 'C1',
        code: 'ERROR_RATE_TREND',
        points: 25,
        triggered: true,
        observed: 4.2,
        threshold: 3.0,
        source: 'net_health_snapshots',
        message: 'Error rate trending up rapidly (4.2x increase in 10 minutes)',
      },
    ],
    evidence: [
      {
        metric: 'rpc_error_rate_1m',
        value: 0.08,
        threshold: 0.03,
        window: '1m',
        source: 'net_health_snapshots',
      },
      {
        metric: 'rpc_error_rate_trend_ratio',
        value: 4.2,
        threshold: 3.0,
        window: '10m',
        source: 'net_health_snapshots',
      },
    ],
  };

  res.json(exampleResponse);
});

export default router;

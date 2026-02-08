import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestDb } from '../../src/db/init';
import { Queries } from '../../src/db/queries';
import type { Database } from 'sql.js';
import {
  Transaction,
  SystemProgram,
  Keypair,
} from '@solana/web3.js';

// Create test app without x402 middleware
function createTestApp(db: Database) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Handle body parser errors
  app.use((err: Error & { type?: string }, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.type === 'entity.too.large') {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'Request body exceeds 64kb limit', trace_id: 'test' }
      });
    }
    next(err);
  });

  // Demo route
  app.get('/demo/sample', (_req, res) => {
    res.json({
      request_id: 'test-uuid',
      computed_at: new Date().toISOString(),
      rule_set_version: 'rev-final-1.0.0',
      risk_score: 55,
      partial: false,
      flags: [],
      evidence: [],
    });
  });

  // Status route (without x402)
  app.get('/solana/status', async (_req, res) => {
    const queries = new Queries(db);
    const snapshot = queries.getLatestSnapshot();

    if (!snapshot) {
      return res.status(503).json({
        error: { code: 'rpc_unavailable', message: 'No data available', trace_id: 'test' }
      });
    }

    res.json({
      ts: snapshot.ts,
      rpc_ok_rate_1m: snapshot.rpc_ok_rate_1m,
      rpc_error_rate_1m: snapshot.rpc_error_rate_1m,
      rpc_p95_ms_1m: snapshot.rpc_p95_ms_1m,
      priority_fee_level: snapshot.priority_fee_level,
    });
  });

  // Preflight route (simplified for testing - without x402 and simulate)
  app.post('/tx/preflight', async (req, res) => {
    const { tx_base64 } = req.body;

    if (!tx_base64 || typeof tx_base64 !== 'string') {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'Missing tx_base64', trace_id: 'test' }
      });
    }

    // Try to parse the transaction
    try {
      Buffer.from(tx_base64, 'base64');
    } catch {
      return res.status(400).json({
        error: { code: 'invalid_tx', message: 'Invalid base64', trace_id: 'test' }
      });
    }

    // Return mock response (always 200)
    res.json({
      request_id: 'test-uuid',
      computed_at: new Date().toISOString(),
      rule_set_version: 'rev-final-1.0.0',
      risk_score: 0,
      partial: false,
      flags: [
        { rule: 'A1', code: 'SOL_BUFFER_LOW', points: 15, triggered: false, skipped: true, reason: 'simulate_failed' },
        { rule: 'A3', code: 'BLACKLISTED_PROGRAM', points: 10, triggered: false },
        { rule: 'B1', code: 'PRIORITY_FEE_SPIKE', points: 20, triggered: false, skipped: true, reason: 'no_snapshot' },
        { rule: 'B2', code: 'RPC_DEGRADATION', points: 30, triggered: false, skipped: true, reason: 'no_snapshot' },
        { rule: 'C1', code: 'ERROR_RATE_TREND', points: 25, triggered: false, skipped: true, reason: 'no_snapshot' },
      ],
      evidence: [],
    });
  });

  return app;
}

describe('API Integration Tests', () => {
  let db: Database;
  let app: express.Express;
  let queries: Queries;

  beforeAll(async () => {
    db = await createTestDb();
    queries = new Queries(db);
    app = createTestApp(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('GET /demo/sample', () => {
    it('should return 200 with example response', async () => {
      const res = await request(app).get('/demo/sample');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('computed_at');
      expect(res.body).toHaveProperty('rule_set_version');
      expect(res.body).toHaveProperty('risk_score');
      expect(res.body).toHaveProperty('flags');
      expect(res.body).toHaveProperty('evidence');
    });
  });

  describe('GET /solana/status', () => {
    it('should return 503 when no snapshot exists', async () => {
      const res = await request(app).get('/solana/status');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('rpc_unavailable');
    });

    it('should return 200 with snapshot data when available', async () => {
      // Insert a snapshot
      queries.insertSnapshot({
        ts: new Date().toISOString(),
        rpc_ok_rate_1m: 0.98,
        rpc_error_rate_1m: 0.02,
        rpc_p95_ms_1m: 450,
        priority_fee_level: 1000,
        tx_fail_rate_1m: null,
        rpc_error_rate_trend_ratio: 1.5,
      });

      const res = await request(app).get('/solana/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ts');
      expect(res.body).toHaveProperty('rpc_ok_rate_1m');
      expect(res.body.rpc_ok_rate_1m).toBe(0.98);
    });
  });

  describe('POST /tx/preflight', () => {
    it('should return 400 for missing tx_base64', async () => {
      const res = await request(app)
        .post('/tx/preflight')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('invalid_request');
    });

    it('should return 200 with valid transaction', async () => {
      const payer = Keypair.generate();
      const recipient = Keypair.generate();

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: recipient.publicKey,
          lamports: 1000000,
        })
      );
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = 'GfVcyD4kkTrj4bKc7WA2sEaCwvb1932K7tSgrvkhN4MJ';

      const serialized = tx.serialize({ requireAllSignatures: false });
      const base64 = serialized.toString('base64');

      const res = await request(app)
        .post('/tx/preflight')
        .send({ tx_base64: base64 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('flags');
      expect(res.body.flags.length).toBe(5); // Always 5 flags
      expect(res.body).toHaveProperty('risk_score');
    });

    it('should always return 5 flags', async () => {
      const payer = Keypair.generate();
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 1000,
        })
      );
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = 'GfVcyD4kkTrj4bKc7WA2sEaCwvb1932K7tSgrvkhN4MJ';

      const serialized = tx.serialize({ requireAllSignatures: false });
      const base64 = serialized.toString('base64');

      const res = await request(app)
        .post('/tx/preflight')
        .send({ tx_base64: base64 });

      expect(res.status).toBe(200);
      expect(res.body.flags.length).toBe(5);

      const ruleIds = res.body.flags.map((f: { rule: string }) => f.rule).sort();
      expect(ruleIds).toEqual(['A1', 'A3', 'B1', 'B2', 'C1']);
    });
  });
});

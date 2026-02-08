import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database } from 'sql.js';
import { createTestDb } from '../src/db/init';
import { Queries } from '../src/db/queries';

describe('Database Queries', () => {
  let db: Database;
  let queries: Queries;

  beforeEach(async () => {
    db = await createTestDb();
    queries = new Queries(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('NetHealthSnapshots', () => {
    it('should insert and retrieve a snapshot', () => {
      const snapshot = {
        ts: new Date().toISOString(),
        rpc_ok_rate_1m: 0.98,
        rpc_error_rate_1m: 0.02,
        rpc_p95_ms_1m: 450,
        priority_fee_level: 1000,
        tx_fail_rate_1m: null,
        rpc_error_rate_trend_ratio: 1.5,
      };

      queries.insertSnapshot(snapshot);
      const latest = queries.getLatestSnapshot();

      expect(latest).not.toBeNull();
      expect(latest!.ts).toBe(snapshot.ts);
      expect(latest!.rpc_ok_rate_1m).toBe(0.98);
      expect(latest!.rpc_error_rate_1m).toBe(0.02);
      expect(latest!.rpc_p95_ms_1m).toBe(450);
      expect(latest!.priority_fee_level).toBe(1000);
      expect(latest!.tx_fail_rate_1m).toBeNull();
      expect(latest!.rpc_error_rate_trend_ratio).toBe(1.5);
    });

    it('should return null when no snapshots exist', () => {
      const latest = queries.getLatestSnapshot();
      expect(latest).toBeNull();
    });

    it('should get last N snapshots', () => {
      for (let i = 0; i < 5; i++) {
        queries.insertSnapshot({
          ts: new Date(Date.now() + i * 1000).toISOString(),
          rpc_ok_rate_1m: 0.95 + i * 0.01,
          rpc_error_rate_1m: 0.05 - i * 0.01,
          rpc_p95_ms_1m: 400 + i * 10,
          priority_fee_level: 1000 + i * 100,
          tx_fail_rate_1m: null,
          rpc_error_rate_trend_ratio: null,
        });
      }

      const last3 = queries.getLastNSnapshots(3);
      expect(last3.length).toBe(3);
      // Should be in descending order by ts
      expect(last3[0].rpc_ok_rate_1m).toBe(0.99);
      expect(last3[2].rpc_ok_rate_1m).toBe(0.97);
    });

    it('should get snapshot in time window', () => {
      const now = Date.now();
      const tenMinAgo = new Date(now - 10 * 60 * 1000).toISOString();
      const nineMinAgo = new Date(now - 9 * 60 * 1000).toISOString();

      queries.insertSnapshot({
        ts: tenMinAgo,
        rpc_ok_rate_1m: 0.90,
        rpc_error_rate_1m: 0.10,
        rpc_p95_ms_1m: 500,
        priority_fee_level: null,
        tx_fail_rate_1m: null,
        rpc_error_rate_trend_ratio: null,
      });

      const elevenMinAgoStr = new Date(now - 11 * 60 * 1000).toISOString();
      const snapshot = queries.getSnapshotInWindow(elevenMinAgoStr, nineMinAgo);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.rpc_error_rate_1m).toBe(0.10);
    });
  });

  describe('PreflightLogs', () => {
    it('should insert and retrieve a preflight log', () => {
      const log = {
        run_id: 'test-run-123',
        computed_at: new Date().toISOString(),
        payer: 'test-payer',
        payment_tx: 'tx-hash-123',
        rule_set_version: 'rev-final-1.0.0',
        request_json: '{"tx_base64":"..."}',
        response_json: '{"risk_score":30}',
        risk_score: 30,
      };

      queries.insertPreflightLog(log);
      const retrieved = queries.getPreflightLog('test-run-123');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.run_id).toBe('test-run-123');
      expect(retrieved!.risk_score).toBe(30);
      expect(retrieved!.payer).toBe('test-payer');
    });

    it('should return null for non-existent log', () => {
      const log = queries.getPreflightLog('non-existent');
      expect(log).toBeNull();
    });
  });
});

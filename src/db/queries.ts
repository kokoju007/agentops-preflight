import type { Database } from 'sql.js';
import { getDb, saveDb } from './init';

export interface NetHealthSnapshot {
  ts: string;
  rpc_ok_rate_1m: number;
  rpc_error_rate_1m: number;
  rpc_p95_ms_1m: number;
  priority_fee_level: number | null;
  tx_fail_rate_1m: number | null;
  rpc_error_rate_trend_ratio: number | null;
  notes: string | null;
}

export interface PreflightLog {
  run_id: string;
  computed_at: string;
  payer: string | null;
  payment_tx: string | null;
  rule_set_version: string;
  request_json: string;
  response_json: string;
  risk_score: number;
}

// Helper to convert sql.js result row to object
function rowToObject<T>(columns: string[], values: (string | number | null)[]): T {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = values[i];
  });
  return obj as T;
}

export class Queries {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  static async create(db?: Database): Promise<Queries> {
    const database = db || await getDb();
    return new Queries(database);
  }

  // Insert a new health snapshot
  insertSnapshot(snapshot: Omit<NetHealthSnapshot, 'notes'> & { notes?: string | null }): void {
    this.db.run(`
      INSERT INTO net_health_snapshots (
        ts, rpc_ok_rate_1m, rpc_error_rate_1m, rpc_p95_ms_1m,
        priority_fee_level, tx_fail_rate_1m, rpc_error_rate_trend_ratio, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      snapshot.ts,
      snapshot.rpc_ok_rate_1m,
      snapshot.rpc_error_rate_1m,
      snapshot.rpc_p95_ms_1m,
      snapshot.priority_fee_level,
      snapshot.tx_fail_rate_1m,
      snapshot.rpc_error_rate_trend_ratio,
      snapshot.notes ?? null
    ]);
    saveDb();
  }

  // Get the latest snapshot
  getLatestSnapshot(): NetHealthSnapshot | null {
    const result = this.db.exec(`
      SELECT * FROM net_health_snapshots
      ORDER BY ts DESC
      LIMIT 1
    `);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return rowToObject<NetHealthSnapshot>(result[0].columns, result[0].values[0]);
  }

  // Get snapshot closest to a time window (for trend calculation)
  getSnapshotInWindow(startTime: string, endTime: string): NetHealthSnapshot | null {
    const stmt = this.db.prepare(`
      SELECT * FROM net_health_snapshots
      WHERE ts >= ? AND ts <= ?
      ORDER BY ts DESC
      LIMIT 1
    `);
    stmt.bind([startTime, endTime]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as NetHealthSnapshot;
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  // Get last N snapshots for baseline calculation
  getLastNSnapshots(n: number): NetHealthSnapshot[] {
    const result = this.db.exec(`
      SELECT * FROM net_health_snapshots
      ORDER BY ts DESC
      LIMIT ${n}
    `);

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map(row =>
      rowToObject<NetHealthSnapshot>(result[0].columns, row)
    );
  }

  // Insert preflight log
  insertPreflightLog(log: PreflightLog): void {
    this.db.run(`
      INSERT INTO preflight_logs (
        run_id, computed_at, payer, payment_tx, rule_set_version,
        request_json, response_json, risk_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      log.run_id,
      log.computed_at,
      log.payer,
      log.payment_tx,
      log.rule_set_version,
      log.request_json,
      log.response_json,
      log.risk_score
    ]);
    saveDb();
  }

  // Get preflight log by run_id
  getPreflightLog(runId: string): PreflightLog | null {
    const stmt = this.db.prepare(`
      SELECT * FROM preflight_logs WHERE run_id = ?
    `);
    stmt.bind([runId]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as PreflightLog;
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }
}

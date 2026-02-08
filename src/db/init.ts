import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

let db: Database | null = null;
let sqlJsInstance: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSqlJs() {
  if (!sqlJsInstance) {
    sqlJsInstance = await initSqlJs();
  }
  return sqlJsInstance;
}

// Inline schema to avoid file path issues with ts-node
const SCHEMA = `
CREATE TABLE IF NOT EXISTS net_health_snapshots (
    ts TEXT NOT NULL,
    rpc_ok_rate_1m REAL NOT NULL,
    rpc_error_rate_1m REAL NOT NULL,
    rpc_p95_ms_1m REAL NOT NULL,
    priority_fee_level REAL,
    tx_fail_rate_1m REAL,
    rpc_error_rate_trend_ratio REAL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_net_health_ts ON net_health_snapshots(ts);

CREATE TABLE IF NOT EXISTS preflight_logs (
    run_id TEXT PRIMARY KEY,
    computed_at TEXT NOT NULL,
    payer TEXT,
    payment_tx TEXT,
    rule_set_version TEXT NOT NULL,
    request_json TEXT NOT NULL,
    response_json TEXT NOT NULL,
    risk_score INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_preflight_computed_at ON preflight_logs(computed_at);
`;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await getSqlJs();

  // Ensure data directory exists
  const dbPath = config.SQLITE_PATH;
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Load existing database or create new
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Run schema statements
  const statements = SCHEMA
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      db.run(stmt);
    } catch (err) {
      // Ignore "table already exists" errors
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('already exists')) {
        console.error('[db] Schema error:', msg);
      }
    }
  }

  // Save to file
  saveDb();

  return db;
}

export function saveDb(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dbPath = config.SQLITE_PATH;
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(dbPath, buffer);
  }
}

export function closeDb(): void {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

// For testing - create in-memory database
export async function createTestDb(): Promise<Database> {
  const SQL = await getSqlJs();
  const testDb = new SQL.Database();

  const statements = SCHEMA
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    testDb.run(stmt);
  }

  return testDb;
}

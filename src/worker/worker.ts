import { config } from '../config';
import { getDb } from '../db/init';
import { Queries } from '../db/queries';
import { collectMetrics, calculateTrendRatio } from './metrics';

let isRunning = false;
let intervalHandle: NodeJS.Timeout | null = null;

async function runSnapshotCycle(): Promise<void> {
  console.log(`[worker] Starting snapshot cycle at ${new Date().toISOString()}`);

  try {
    // Collect metrics from RPC
    const metrics = await collectMetrics(5);

    if (!metrics) {
      console.error('[worker] Failed to collect metrics, skipping cycle');
      return;
    }

    // Get database and queries
    const db = await getDb();
    const queries = new Queries(db);

    // Calculate trend ratio
    // Query snapshot from ~10 minutes ago (9-11 minute window)
    const now = Date.now();
    const elevenMinAgo = new Date(now - 11 * 60 * 1000).toISOString();
    const nineMinAgo = new Date(now - 9 * 60 * 1000).toISOString();
    const prevSnapshot = queries.getSnapshotInWindow(elevenMinAgo, nineMinAgo);

    const trendRatio = calculateTrendRatio(
      metrics.rpc_error_rate_1m,
      prevSnapshot?.rpc_error_rate_1m ?? null
    );

    // Insert new snapshot
    const snapshot = {
      ts: new Date().toISOString(),
      rpc_ok_rate_1m: metrics.rpc_ok_rate_1m,
      rpc_error_rate_1m: metrics.rpc_error_rate_1m,
      rpc_p95_ms_1m: metrics.rpc_p95_ms_1m,
      priority_fee_level: metrics.priority_fee_level,
      tx_fail_rate_1m: null, // v1 does not measure this
      rpc_error_rate_trend_ratio: trendRatio,
      notes: null,
    };

    queries.insertSnapshot(snapshot);
    console.log(`[worker] Snapshot saved: ok_rate=${metrics.rpc_ok_rate_1m}, p95=${metrics.rpc_p95_ms_1m}ms, trend_ratio=${trendRatio}`);
  } catch (err) {
    console.error('[worker] Error in snapshot cycle:', err);
  }
}

export function startWorker(): void {
  if (isRunning) {
    console.log('[worker] Already running');
    return;
  }

  isRunning = true;
  console.log(`[worker] Starting with interval ${config.WORKER_INTERVAL_MS}ms`);

  // Run immediately on start
  runSnapshotCycle();

  // Then run on interval
  intervalHandle = setInterval(runSnapshotCycle, config.WORKER_INTERVAL_MS);
}

export function stopWorker(): void {
  if (!isRunning) {
    console.log('[worker] Not running');
    return;
  }

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  isRunning = false;
  console.log('[worker] Stopped');
}

// Run directly if this file is executed
if (require.main === module) {
  console.log('[worker] Starting as standalone process');
  startWorker();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('[worker] Received SIGINT, stopping...');
    stopWorker();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[worker] Received SIGTERM, stopping...');
    stopWorker();
    process.exit(0);
  });
}

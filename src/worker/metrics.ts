import { Connection } from '@solana/web3.js';
import { getRpcUrls } from '../config';

export interface RpcPingResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

export interface MetricsResult {
  rpc_ok_rate_1m: number;
  rpc_error_rate_1m: number;
  rpc_p95_ms_1m: number;
  priority_fee_level: number | null;
  latencies: number[];
}

// Ping RPC by calling getLatestBlockhash
async function pingRpc(connection: Connection, timeoutMs = 5000): Promise<RpcPingResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    await connection.getLatestBlockhash('confirmed');

    clearTimeout(timeout);
    return {
      success: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// Calculate P95 from sorted latency array
export function calculateP95(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, index)];
}

// Try to get priority fee from RPC
async function getPriorityFee(connection: Connection): Promise<number | null> {
  try {
    // getRecentPrioritizationFees returns recent priority fees
    const fees = await connection.getRecentPrioritizationFees();
    if (!fees || fees.length === 0) {
      return null;
    }
    // Return median of recent fees
    const feeValues = fees.map(f => f.prioritizationFee).filter(f => f > 0);
    if (feeValues.length === 0) return null;
    feeValues.sort((a, b) => a - b);
    const midIndex = Math.floor(feeValues.length / 2);
    return feeValues[midIndex];
  } catch {
    // getRecentPrioritizationFees might not be supported
    return null;
  }
}

// Collect metrics from RPC with fallback
export async function collectMetrics(pingCount = 5): Promise<MetricsResult | null> {
  const rpcUrls = getRpcUrls();

  for (const rpcUrl of rpcUrls) {
    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      const results: RpcPingResult[] = [];

      // Send N pings
      for (let i = 0; i < pingCount; i++) {
        const result = await pingRpc(connection);
        results.push(result);
        // Small delay between pings
        if (i < pingCount - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      const successes = results.filter(r => r.success).length;
      const okRate = successes / pingCount;

      // If all pings failed, try next RPC
      if (successes === 0) {
        console.error(`[metrics] All ${pingCount} pings failed for ${rpcUrl}, trying next RPC...`);
        continue;
      }

      const latencies = results.filter(r => r.success).map(r => r.latencyMs);
      const p95 = calculateP95(latencies);
      const priorityFee = await getPriorityFee(connection);

      return {
        rpc_ok_rate_1m: okRate,
        rpc_error_rate_1m: 1 - okRate,
        rpc_p95_ms_1m: p95,
        priority_fee_level: priorityFee,
        latencies,
      };
    } catch (err) {
      console.error(`[metrics] Error with RPC ${rpcUrl}:`, err);
      continue;
    }
  }

  // All RPCs failed
  console.error('[metrics] All RPC endpoints failed, skipping this snapshot cycle');
  return null;
}

// Calculate trend ratio comparing current error rate to previous
export function calculateTrendRatio(
  currentErrorRate: number,
  prevErrorRate: number | null
): number | null {
  if (prevErrorRate === null) return null;
  // Use epsilon to prevent division by zero
  const epsilon = 0.001;
  return currentErrorRate / Math.max(prevErrorRate, epsilon);
}

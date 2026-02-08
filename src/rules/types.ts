export interface RuleFlag {
  rule: string;
  code: string;
  points: number;
  triggered: boolean;
  skipped?: boolean;
  reason?: string;
  observed?: number | string;
  threshold?: number | string;
  source?: string;
  message?: string;
}

export interface Evidence {
  metric: string;
  value: number;
  threshold: number;
  window: string;
  source: string;
}

export interface RuleContext {
  // Simulation data
  simulateFailed: boolean;
  feePayerLamports?: number;
  programIds: string[];

  // Snapshot data
  snapshot: {
    available: boolean;
    stale: boolean;
    staleReason?: string;
    rpc_error_rate_1m?: number;
    rpc_p95_ms_1m?: number;
    priority_fee_level?: number | null;
    rpc_error_rate_trend_ratio?: number | null;
  };

  // For B1 baseline calculation
  priorityFeeBaseline?: number | null;
}

export interface RuleResult {
  flag: RuleFlag;
  evidence?: Evidence;
}

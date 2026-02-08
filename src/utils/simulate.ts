import {
  Connection,
  Transaction,
  VersionedTransaction,
  PublicKey,
  SimulatedTransactionResponse,
  RpcResponseAndContext,
} from '@solana/web3.js';
import { getRpcUrls } from '../config';

const SIMULATE_TIMEOUT_MS = 5000;

export interface SimulateResult {
  success: boolean;
  simulateFailed: boolean;
  response?: RpcResponseAndContext<SimulatedTransactionResponse>;
  feePayerLamports?: number;
  error?: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), ms);
  });
  return Promise.race([promise, timeout]);
}

async function simulateOnConnection(
  connection: Connection,
  tx: Transaction | VersionedTransaction,
  feePayer: PublicKey
): Promise<SimulateResult> {
  try {
    const feePayerAddress = feePayer.toBase58();
    const options = {
      accounts: {
        addresses: [feePayerAddress],
        encoding: 'base64' as const,
      },
    };

    let response: RpcResponseAndContext<SimulatedTransactionResponse>;

    if (tx instanceof VersionedTransaction) {
      response = await withTimeout(
        connection.simulateTransaction(tx, options),
        SIMULATE_TIMEOUT_MS
      );
    } else {
      response = await withTimeout(
        connection.simulateTransaction(tx, undefined, [feePayer]),
        SIMULATE_TIMEOUT_MS
      );
    }

    // Check for simulation errors
    if (response.value.err) {
      return {
        success: false,
        simulateFailed: false,
        response,
        error: JSON.stringify(response.value.err),
      };
    }

    // Extract fee payer's post-simulation balance
    let feePayerLamports: number | undefined;
    if (response.value.accounts && response.value.accounts.length > 0) {
      const account = response.value.accounts[0];
      if (account && typeof account === 'object' && 'lamports' in account) {
        feePayerLamports = account.lamports;
      }
    }

    return {
      success: true,
      simulateFailed: false,
      response,
      feePayerLamports,
    };
  } catch (err) {
    return {
      success: false,
      simulateFailed: true,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function simulateTransaction(
  tx: Transaction | VersionedTransaction,
  feePayer: PublicKey
): Promise<SimulateResult> {
  const rpcUrls = getRpcUrls();

  for (const rpcUrl of rpcUrls) {
    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      const result = await simulateOnConnection(connection, tx, feePayer);

      // If simulate failed (timeout/error), try next RPC
      if (result.simulateFailed) {
        console.error(`[simulate] Failed on ${rpcUrl}: ${result.error}, trying next RPC...`);
        continue;
      }

      return result;
    } catch (err) {
      console.error(`[simulate] Error with RPC ${rpcUrl}:`, err);
      continue;
    }
  }

  // All RPCs failed
  return {
    success: false,
    simulateFailed: true,
    error: 'All RPC endpoints failed or timed out',
  };
}

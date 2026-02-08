import {
  Transaction,
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';

export interface ParsedTransaction {
  isVersioned: boolean;
  feePayer: PublicKey;
  programIds: string[];
  transaction: Transaction | VersionedTransaction;
}

export function parseTransaction(txBase64: string): ParsedTransaction {
  const buffer = Buffer.from(txBase64, 'base64');

  // Try VersionedTransaction first
  let vtxError: Error | null = null;
  try {
    const vtx = VersionedTransaction.deserialize(buffer);
    const message = vtx.message;

    // Check if this is actually a versioned message by checking for compiledInstructions
    if ('compiledInstructions' in message) {
      // Extract fee payer (first account in static account keys)
      const feePayer = message.staticAccountKeys[0];

      // Extract program IDs from compiled instructions
      const programIds: string[] = [];
      for (const ix of message.compiledInstructions) {
        const programId = message.staticAccountKeys[ix.programIdIndex];
        if (programId) {
          const programIdStr = programId.toBase58();
          if (!programIds.includes(programIdStr)) {
            programIds.push(programIdStr);
          }
        }
      }

      return {
        isVersioned: true,
        feePayer,
        programIds,
        transaction: vtx,
      };
    }
  } catch (err) {
    vtxError = err instanceof Error ? err : new Error('Unknown error');
  }

  // Try legacy Transaction
  try {
    const tx = Transaction.from(buffer);

    // Fee payer is from feePayer field or first signer
    const feePayer = tx.feePayer || tx.signatures[0]?.publicKey;
    if (!feePayer) {
      throw new Error('Cannot determine fee payer from transaction');
    }

    // Extract program IDs from instructions
    const programIds: string[] = [];
    for (const ix of tx.instructions) {
      const programIdStr = ix.programId.toBase58();
      if (!programIds.includes(programIdStr)) {
        programIds.push(programIdStr);
      }
    }

    return {
      isVersioned: false,
      feePayer,
      programIds,
      transaction: tx,
    };
  } catch (legacyErr) {
    // Both failed, throw combined error
    const vtxMsg = vtxError?.message || 'Unknown error';
    const legacyMsg = legacyErr instanceof Error ? legacyErr.message : 'Unknown error';
    throw new Error(
      `Failed to deserialize transaction. Versioned: ${vtxMsg}. Legacy: ${legacyMsg}`
    );
  }
}

// Validate base64 encoding
export function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  try {
    const buffer = Buffer.from(str, 'base64');
    // Check if it decodes back to the same
    return buffer.toString('base64') === str;
  } catch {
    return false;
  }
}

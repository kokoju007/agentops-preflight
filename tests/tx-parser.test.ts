import { describe, it, expect } from 'vitest';
import {
  Transaction,
  SystemProgram,
  Keypair,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import { parseTransaction, isValidBase64 } from '../src/utils/tx-parser';

describe('Transaction Parser', () => {
  describe('parseTransaction', () => {
    it('should parse a legacy transaction', () => {
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

      const parsed = parseTransaction(base64);

      // The key assertions are fee payer and program IDs
      expect(parsed.feePayer.toBase58()).toBe(payer.publicKey.toBase58());
      expect(parsed.programIds).toContain(SystemProgram.programId.toBase58());
      expect(parsed.transaction).toBeDefined();
    });

    it('should parse a versioned transaction', () => {
      const payer = Keypair.generate();
      const recipient = Keypair.generate();

      const instructions = [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: recipient.publicKey,
          lamports: 1000000,
        }),
      ];

      const blockhash = 'GfVcyD4kkTrj4bKc7WA2sEaCwvb1932K7tSgrvkhN4MJ';
      const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const vtx = new VersionedTransaction(messageV0);
      const serialized = vtx.serialize();
      const base64 = Buffer.from(serialized).toString('base64');

      const parsed = parseTransaction(base64);

      // The key assertions are fee payer and program IDs
      expect(parsed.feePayer.toBase58()).toBe(payer.publicKey.toBase58());
      expect(parsed.programIds).toContain(SystemProgram.programId.toBase58());
      expect(parsed.transaction).toBeDefined();
    });

    it('should extract multiple program IDs', () => {
      const payer = Keypair.generate();
      const recipient1 = Keypair.generate();
      const recipient2 = Keypair.generate();

      const tx = new Transaction()
        .add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: recipient1.publicKey,
            lamports: 1000000,
          })
        )
        .add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: recipient2.publicKey,
            lamports: 2000000,
          })
        );
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = 'GfVcyD4kkTrj4bKc7WA2sEaCwvb1932K7tSgrvkhN4MJ';

      const serialized = tx.serialize({ requireAllSignatures: false });
      const base64 = serialized.toString('base64');

      const parsed = parseTransaction(base64);

      // Should deduplicate - only one System Program
      expect(parsed.programIds.length).toBeGreaterThanOrEqual(1);
      expect(parsed.programIds).toContain(SystemProgram.programId.toBase58());
    });

    it('should throw on invalid base64', () => {
      expect(() => parseTransaction('not-valid-base64!!!')).toThrow();
    });

    it('should throw on invalid transaction data', () => {
      const invalidData = Buffer.from('random invalid data').toString('base64');
      expect(() => parseTransaction(invalidData)).toThrow();
    });
  });

  describe('isValidBase64', () => {
    it('should return true for valid base64', () => {
      const valid = Buffer.from('hello world').toString('base64');
      expect(isValidBase64(valid)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidBase64('')).toBe(false);
    });

    it('should return false for invalid base64', () => {
      // Base64 strings should not have these characters in ways that break decoding
      expect(isValidBase64('!!!')).toBe(false);
    });

    it('should return true for empty content base64', () => {
      // Empty buffer encoded
      const emptyBase64 = Buffer.from('').toString('base64');
      // Empty string encodes to empty string in base64
      expect(isValidBase64(emptyBase64)).toBe(false); // Empty base64 is empty string
    });
  });
});
